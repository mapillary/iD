
import { operationDelete } from '../operations/index';
import { t } from '../util/locale';
import { utilDisplayLabel } from '../util';
import { validationIssue, validationIssueFix } from '../core/validator';


export function validationUnknownRoad() {
    var type = 'unknown_road';

    var validation = function(entity, context) {

        if (entity.type !== 'way' || entity.tags.highway !== 'road') return [];

        var fixes = [
            new validationIssueFix({
                icon: 'iD-icon-search',
                title: t('issues.fix.select_road_type.title'),
                onClick: function() {
                    context.ui().sidebar.showPresetList();
                }
            })
        ];

        if (!operationDelete([entity.id], context).disabled()) {
            fixes.push(
                new validationIssueFix({
                    icon: 'iD-operation-delete',
                    title: t('issues.fix.delete_feature.title'),
                    onClick: function() {
                        var id = this.issue.entities[0].id;
                        var operation = operationDelete([id], context);
                        if (!operation.disabled()) {
                            operation();
                        }
                    }
                })
            );
        }

        return [new validationIssue({
            type: type,
            severity: 'warning',
            message: t('issues.unknown_road.message', {
                feature: utilDisplayLabel(entity, context),
            }),
            tooltip: t('issues.unknown_road.tip'),
            entities: [entity],
            fixes: fixes
        })];
    };

    validation.type = type;

    return validation;
}
