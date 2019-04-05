import { dispatch as d3_dispatch } from 'd3-dispatch';

import { geoExtent } from '../geo';
import { osmEntity } from '../osm';
import { t } from '../util/locale';
import { utilArrayFlatten, utilRebind } from '../util';
import * as Validations from '../validations/index';


export function coreValidator(context) {
    var dispatch = d3_dispatch('reload');
    var self = {};
    var _issues = [];
    var _issuesByEntityID = {};
    var _disabledValidations = {};

    var validations = {};
    Object.values(Validations).forEach(function(validation) {
        if (typeof validation === 'function') {
            var fn = validation();
            validations[fn.type] = fn;
        }
    });

    var entityValidationIDs = [];
    var changesValidationIDs = [];

    for (var key in validations) {
        var validation = validations[key];
        if (validation.inputType && validation.inputType === 'changes') {
            changesValidationIDs.push(key);
        } else {
            entityValidationIDs.push(key);
        }
    }

    var validationIDsToDisplay = Object.keys(validations)
        .filter(function(rule) { return rule !== 'maprules'; });

    validationIDsToDisplay.sort(function(rule1, rule2) {
        return t('issues.' + rule1 + '.title') > t('issues.' + rule2 + '.title');
    });

    //self.featureApplicabilityOptions = ['edited', 'all'];

    /*var featureApplicability = context.storage('issue-features') || 'edited';

    self.getFeatureApplicability = function() {
        return featureApplicability;
    };

    self.setFeatureApplicability = function(applicability) {
        featureApplicability = applicability;
        context.storage('issue-features', applicability);
    };*/

    self.getIssues = function() {
        return _issues;
    };

    self.getWarnings = function() {
        return _issues.filter(function(d) { return d.severity === 'warning'; });
    };

    self.getErrors = function() {
        return _issues.filter(function(d) { return d.severity === 'error'; });
    };

    self.getIssuesForEntityWithID = function(entityID) {
        if (!context.hasEntity(entityID)) return [];
        var entity = context.entity(entityID);
        var key = osmEntity.key(entity);

        if (!_issuesByEntityID[key]) {
            _issuesByEntityID[key] = validateEntity(entity);
        }
        return _issuesByEntityID[key];
    };

    self.getRuleIDs = function(){
        return validationIDsToDisplay;
    };

    self.getDisabledRules = function(){
        return _disabledValidations;
    };

    self.toggleRule = function(ruleID) {
        if (_disabledValidations[ruleID]) {
            delete _disabledValidations[ruleID];
        } else {
            _disabledValidations[ruleID] = true;
        }
        self.validate();
    };

    function validateEntity(entity) {
        var _issues = [];
        var ran = {};

        // runs validation and appends resulting issues, returning true if validation passed
        function runValidation(which) {
            if (ran[which]) return true;

            if (_disabledValidations[which]) {
                // don't run disabled validations but mark as having run
                ran[which] = true;
                return true;
            }

            var fn = validations[which];
            var typeIssues = fn(entity, context);
            _issues = _issues.concat(typeIssues);
            ran[which] = true;   // mark this validation as having run
            return !typeIssues.length;
        }

        runValidation('missing_role');

        if (entity.type === 'relation') {
            if (!runValidation('old_multipolygon')) {
                // don't flag missing tags if they are on the outer way
                ran.missing_tag = true;
            }
        }

        // other validations require feature to be tagged
        if (!runValidation('missing_tag')) return _issues;

        // run outdated_tags early
        runValidation('outdated_tags');

        if (entity.type === 'way') {
            runValidation('crossing_ways');

            // only check for disconnected way if no almost junctions
            if (runValidation('almost_junction')) {
                runValidation('disconnected_way');
            } else {
                ran.disconnected_way = true;
            }

            runValidation('tag_suggests_area');
        }

        // run all validations not yet run manually
        entityValidationIDs.forEach(runValidation);

        return _issues;
    }


    self.validate = function() {
        _issuesByEntityID = {};   // clear cached
        _issues = [];

        for (var validationIndex in validations) {
            if (validations[validationIndex].reset) {
                validations[validationIndex].reset();
            }
        }

        var history = context.history();
        var changes = history.changes();
        var changesToCheck = changes.created.concat(changes.modified);
        var graph = history.graph();

        _issues = utilArrayFlatten(changesValidationIDs.map(function(ruleID) {
            if (_disabledValidations[ruleID]) return [];
            var validation = validations[ruleID];
            return validation(changes, context);
        }));

        var entitiesToCheck = changesToCheck.reduce(function(acc, entity) {
            var entities = [entity];
            acc.add(entity);

            if (entity.type === 'node') {
                // check parent ways if their nodes have changed
                graph.parentWays(entity).forEach(function(parentWay) {
                    entities.push(parentWay);
                    acc.add(parentWay);
                });
            }

            entities.forEach(function(entity) {
                // check parent relations if their geometries have changed
                if (entity.type !== 'relation') {
                    graph.parentRelations(entity).forEach(function(parentRel) {
                        acc.add(parentRel);
                    });
                }
            });

            return acc;

        }, new Set());


        var issuesByID = {};

        entitiesToCheck.forEach(function(entity) {
            var entityIssues = validateEntity(entity);
            _issuesByEntityID[entity.id] = entityIssues;
            entityIssues.forEach(function(issue) {
                // Different entities can produce the same issue so store them by
                // the ID to ensure that there are no duplicate issues.
                issuesByID[issue.id()] = issue;
            });
        });

        for (var issueID in issuesByID) {
            _issues.push(issuesByID[issueID]);
        }

        dispatch.call('reload', self, _issues);
    };

    return utilRebind(self, dispatch, 'on');
}


export function validationIssue(attrs) {
    this.type = attrs.type;                // required
    this.severity = attrs.severity;        // required - 'warning' or 'error'
    this.message = attrs.message;          // required - localized string
    this.tooltip = attrs.tooltip;          // required - localized string
    this.entities = attrs.entities;        // optional - array of entities
    this.loc = attrs.loc;                  // optional - expect a [lon, lat] array
    this.info = attrs.info;                // optional - object containing arbitrary extra information
    this.fixes = attrs.fixes;              // optional - array of validationIssueFix objects
    this.hash = attrs.hash;                // optional - string to further differentiate the issue


    var _id;

    // A unique, deterministic string hash.
    // Issues with identical id values are considered identical.
    this.id = function() {
        if (_id) return _id;

        _id = this.type;

        if (this.hash) {   // subclasses can pass in their own differentiator
            _id += this.hash;
        }

        // factor in the entities this issue is for
        // (sort them so the id is deterministic)
        var entityKeys = this.entities.map(osmEntity.key);
        _id += entityKeys.sort().join();

        // factor in loc since two separate issues can have an
        // idential type and entities, e.g. in crossing_ways
        if (this.loc) {
            _id += this.loc.join();
        }
        return _id;
    };


    this.extent = function(resolver) {
        if (this.loc) {
            return geoExtent(this.loc);
        }
        if (this.entities && this.entities.length) {
            return this.entities.reduce(function(extent, entity) {
                return extent.extend(entity.extent(resolver));
            }, geoExtent());
        }
        return null;
    };


    if (this.fixes) {   // add a reference in the fixes to the issue for use in fix actions
        for (var i = 0; i < this.fixes.length; i++) {
            this.fixes[i].issue = this;
        }
    }
}


export function validationIssueFix(attrs) {
    this.icon = attrs.icon;
    this.title = attrs.title;
    this.onClick = attrs.onClick;
    this.entityIds = attrs.entityIds || [];  // Used for hover-higlighting.
    this.issue = null;    // the issue this fix is for
}
