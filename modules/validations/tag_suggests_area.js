import { actionAddVertex, actionChangeTags, actionMergeNodes } from '../actions';
import { geoHasSelfIntersections, geoSphericalDistance } from '../geo';
import { t } from '../util/locale';
import { utilDisplayLabel, utilTagText } from '../util';
import { validationIssue, validationIssueFix } from '../core/validator';


export function validationTagSuggestsArea() {
    var type = 'tag_suggests_area';


    var validation = function(entity, context) {
        if (entity.type !== 'way' || entity.isClosed()) return [];

        var tagSuggestingArea = entity.tagSuggestingArea();
        if (!tagSuggestingArea) {
            return [];
        }

        if (context.presets().matchTags(tagSuggestingArea, 'line') ===
            context.presets().matchTags(tagSuggestingArea, 'area')) {
            // these tags also allow lines and making this an area wouldn't matter
            return [];
        }

        var tagText = utilTagText({ tags: tagSuggestingArea });
        var fixes = [];

        var connectEndpointsOnClick;

        // must have at least three nodes to close this automatically
        if (entity.nodes.length >= 3) {
            var nodes = context.graph().childNodes(entity), testNodes;
            var firstToLastDistanceMeters = geoSphericalDistance(nodes[0].loc, nodes[nodes.length-1].loc);

            // if the distance is very small, attempt to merge the endpoints
            if (firstToLastDistanceMeters < 0.75) {
                testNodes = nodes.slice();   // shallow copy
                testNodes.pop();
                testNodes.push(testNodes[0]);
                // make sure this will not create a self-intersection
                if (!geoHasSelfIntersections(testNodes, testNodes[0].id)) {
                    connectEndpointsOnClick = function() {
                        var way = this.issue.entities[0];
                        context.perform(
                            actionMergeNodes([way.nodes[0], way.nodes[way.nodes.length-1]], nodes[0].loc),
                            t('issues.fix.connect_endpoints.annotation')
                        );
                    };
                }
            }

            if (!connectEndpointsOnClick) {
                // if the points were not merged, attempt to close the way
                testNodes = nodes.slice();   // shallow copy
                testNodes.push(testNodes[0]);
                // make sure this will not create a self-intersection
                if (!geoHasSelfIntersections(testNodes, testNodes[0].id)) {
                    connectEndpointsOnClick = function() {
                        var way = this.issue.entities[0];
                        var nodeId = way.nodes[0];
                        var index = way.nodes.length;
                        context.perform(
                            actionAddVertex(way.id, nodeId, index),
                            t('issues.fix.connect_endpoints.annotation')
                        );
                    };
                }
            }
        }

        fixes.push(new validationIssueFix({
            title: t('issues.fix.connect_endpoints.title'),
            onClick: connectEndpointsOnClick
        }));

        fixes.push(new validationIssueFix({
            icon: 'iD-operation-delete',
            title: t('issues.fix.remove_tag.title'),
            onClick: function() {
                var entity = this.issue.entities[0];
                var tags = Object.assign({}, entity.tags);  // shallow copy
                for (var key in tagSuggestingArea) {
                    delete tags[key];
                }
                context.perform(
                    actionChangeTags(entity.id, tags),
                    t('issues.fix.remove_tag.annotation')
                );
            }
        }));

        var featureLabel = utilDisplayLabel(entity, context);
        return [new validationIssue({
            type: type,
            severity: 'warning',
            message: t('issues.tag_suggests_area.message', { feature: featureLabel, tag: tagText }),
            tooltip: t('issues.tag_suggests_area.tip'),
            entities: [entity],
            fixes: fixes
        })];
    };

    validation.type = type;

    return validation;
}
