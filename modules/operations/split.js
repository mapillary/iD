import { t } from '../util/locale';
import { actionSplit } from '../actions/index';
import { behaviorOperation } from '../behavior/index';
import { modeSelect } from '../modes/index';


export function operationSplit(selectedIDs, context) {
    var vertices = selectedIDs.filter(function(id) {
        return context.geometry(id) === 'vertex';
    });

    var entityID = vertices[0];
    var action = actionSplit(entityID);
    var ways = [];

    if (vertices.length === 1) {
        if (entityID && selectedIDs.length > 1) {
            var ids = selectedIDs.filter(function(id) { return id !== entityID; });
            action.limitWays(ids);
        }
        ways = action.ways(context.graph());
    }


    var operation = function() {
        var difference = context.perform(action, operation.annotation());
        context.enter(modeSelect(context, difference.extantIDs()));
    };


    operation.available = function() {
        return vertices.length === 1;
    };


    operation.disabled = function() {
        var reason;
        if (selectedIDs.some(context.hasHiddenConnections)) {
            reason = 'connected_to_hidden';
        }
        return action.disabled(context.graph()) || reason;
    };


    operation.tooltip = function() {
        var disable = operation.disabled();
        if (disable) {
            return t('operations.split.' + disable);
        }
        if (ways.length === 1) {
            return t('operations.split.description.' + context.geometry(ways[0].id));
        } else {
            return t('operations.split.description.multiple');
        }
    };


    operation.annotation = function() {
        return ways.length === 1 ?
            t('operations.split.annotation.' + context.geometry(ways[0].id)) :
            t('operations.split.annotation.multiple', { n: ways.length });
    };


    operation.id = 'split';
    operation.keys = [t('operations.split.key')];
    operation.title = t('operations.split.title');
    operation.behavior = behaviorOperation(context).which(operation);

    return operation;
}
