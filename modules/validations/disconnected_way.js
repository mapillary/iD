import { t } from '../util/locale';
import { modeDrawLine } from '../modes';
import { operationDelete } from '../operations/index';
import { utilDisplayLabel } from '../util';
import { validationIssue, validationIssueFix } from '../core/validator';


export function validationDisconnectedWay() {
    var type = 'disconnected_way';

    var highways = {
        residential: true, service: true, track: true, unclassified: true, footway: true,
        path: true, tertiary: true, secondary: true, primary: true, living_street: true,
        cycleway: true, trunk: true, steps: true, motorway: true, motorway_link: true,
        pedestrian: true, trunk_link: true, primary_link: true, secondary_link: true,
        road: true, tertiary_link: true, bridleway: true, raceway: true, corridor: true,
        bus_guideway: true
    };

    function isTaggedAsHighway(entity) {
        return highways[entity.tags.highway];
    }

    function vertexIsDisconnected(way, vertex, graph, relation) {
        var parents = graph.parentWays(vertex);

        // standalone vertex
        if (parents.length === 1) return true;

        // entrances are considered connected
        if (vertex.tags.entrance && vertex.tags.entrance !== 'no') return false;

        return !parents.some(function(parentWay) {
            // ignore the way we're testing
            if (parentWay === way) return false;

            if (isTaggedAsHighway(parentWay)) return true;

            return graph.parentMultipolygons(parentWay).some(function(parentRelation) {
                // ignore the relation we're testing, if any
                if (relation && parentRelation === relation) return false;

                return isTaggedAsHighway(parentRelation);
            });
        });
    }

    function isDisconnectedWay(entity, graph) {

        if (entity.type !== 'way') return false;

        return graph.childNodes(entity).every(function(vertex) {
            return vertexIsDisconnected(entity, vertex, graph);
        });
    }

    function isDisconnectedMultipolygon(entity, graph) {

        if (entity.type !== 'relation' || !entity.isMultipolygon()) return false;

        return entity.members.every(function(member) {
            if (member.type !== 'way') return true;

            var way = graph.hasEntity(member.id);
            if (!way) return true;

            return graph.childNodes(way).every(function(vertex) {
                return vertexIsDisconnected(way, vertex, graph, entity);
            });
        });
    }


    var validation = function(entity, context) {
        var graph = context.graph();

        if (!isTaggedAsHighway(entity)) return [];

        if (!isDisconnectedWay(entity, graph) && !isDisconnectedMultipolygon(entity, graph)) return [];

        var entityLabel = utilDisplayLabel(entity, context);
        var fixes = [];

        if (entity.type === 'way' && !entity.isClosed()) {
            var first = context.entity(entity.first());
            if (first.tags.noexit !== 'yes') {
                fixes.push(new validationIssueFix({
                    icon: 'iD-operation-continue-left',
                    title: t('issues.fix.continue_from_start.title'),
                    entityIds: [entity.first()],
                    onClick: function() {
                        var vertex = context.entity(entity.first());
                        continueDrawing(entity, vertex, context);
                    }
                }));
            }
            var last = context.entity(entity.last());
            if (last.tags.noexit !== 'yes') {
                fixes.push(new validationIssueFix({
                    icon: 'iD-operation-continue',
                    title: t('issues.fix.continue_from_end.title'),
                    entityIds: [entity.last()],
                    onClick: function() {
                        var vertex = context.entity(entity.last());
                        continueDrawing(entity, vertex, context);
                    }
                }));
            }
        }

        if (!operationDelete([entity.id], context).disabled()) {
            fixes.push(new validationIssueFix({
                icon: 'iD-operation-delete',
                title: t('issues.fix.delete_feature.title'),
                entityIds: [entity.id],
                onClick: function() {
                    var id = this.issue.entities[0].id;
                    var operation = operationDelete([id], context);
                    if (!operation.disabled()) {
                        operation();
                    }
                }
            }));
        }

        return [new validationIssue({
            type: type,
            severity: 'warning',
            message: t('issues.disconnected_way.highway.message', { highway: entityLabel }),
            tooltip: t('issues.disconnected_way.highway.tip'),
            entities: [entity],
            fixes: fixes
        })];


        function continueDrawing(way, vertex) {
            // make sure the vertex is actually visible and editable
            var map = context.map();
            if (!map.editable() || !map.trimmedExtent().contains(vertex.loc)) {
                map.zoomToEase(vertex);
            }

            context.enter(
                modeDrawLine(context, way.id, context.graph(), context.graph(), way.affix(vertex.id), true)
            );
        }
    };


    validation.type = type;

    return validation;
}
