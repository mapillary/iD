import _some from 'lodash-es/some';
import _throttle from 'lodash-es/throttle';
import { select as d3_select } from 'd3-selection';
import { svgPointTransform } from './index';
import { services } from '../services';


export function svgMapillaryPoints(projection, context, dispatch) {
    var throttledRedraw = _throttle(function () { dispatch.call('change'); }, 1000);
    var minZoom = 12;
    var layer = d3_select(null);
    var _mapillary;


    function init() {
        if (svgMapillaryPoints.initialized) return;  // run once
        svgMapillaryPoints.enabled = false;
        svgMapillaryPoints.initialized = true;
    }


    function getService() {
        if (services.mapillary && !_mapillary) {
            _mapillary = services.mapillary;
            _mapillary.event.on('loadedPoints', throttledRedraw);
        } else if (!services.mapillary && _mapillary) {
            _mapillary = null;
        }
        return _mapillary;
    }


    function showLayer() {
        var service = getService();
        if (!service) return;

        service.loadViewer(context);
        editOn();
    }


    function hideLayer() {
        throttledRedraw.cancel();
        editOff();
    }


    function editOn() {
        layer.style('display', 'block');
    }


    function editOff() {
        layer.selectAll('.icon-point').remove();
        layer.style('display', 'none');
    }

    function shouldDisplayTile(filters, data) {
        return (filters.mapillaryCoverage && !data.organization_key && !filters.organization_key)
            || (filters.organization_key && data.organization_key === filters.organization_key);
    }

    function click(d) {
        var service = getService();
        if (!service) return;

        context.map().centerEase(d.loc);

        var selected = service.getSelectedImage();
        var selectedImageKey = selected && selected.key;
        var imageKey;

        // Pick one of the images the feature was detected in,
        // preference given to an image already selected.
        d.detections.forEach(function(detection) {
            if (!imageKey || selectedImageKey === detection.image_key) {
                imageKey = detection.image_key;
            }
        });

        service
            .selectImage(null, imageKey)
            .updateViewer(imageKey, context)
            .showViewer();
    }

    function update() {
        var service = getService();
        var data = (service ? service.points(projection) : []);
        var viewer = d3_select('#photoviewer');
        var selected = viewer.empty() ? undefined : viewer.datum();
        var selectedImageKey = selected && selected.key;
        var transform = svgPointTransform(projection);
        var filters = service.filters();

        var points = layer.selectAll('.icon-point')
            .data(data, function(d) { return d.key; });

        // exit
        points.exit()
            .remove();

        // enter
        var enter = points.enter()
            .append('use')
            .attr('class', 'icon-point')
            .attr('width', '24px')
            .attr('height', '24px')
            .attr('x', '-12px')
            .attr('y', '-12px')
            .attr('xlink:href', function(d) { return '#' + d.value; })
            .classed('currentView', function(d) {
                return _some(d.detections, function(detection) {
                    return detection.image_key === selectedImageKey;
                });
            })
            .on('click', click);

        // update
        points
            .merge(enter)
            .sort(function(a, b) {
                return (a === selected) ? 1
                    : (b === selected) ? -1
                    : b.loc[1] - a.loc[1];  // sort Y
            })
            .style('display', function(d) {
                return shouldDisplayTile(filters, d)
                    ? null
                    : 'none';
                }
            )
            .attr('transform', transform);
    }


    function drawPoints(selection) {
        var enabled = svgMapillaryPoints.enabled;
        var service = getService();

        layer = selection.selectAll('.layer-mapillary-points')
            .data(service ? [0] : []);

        layer.exit()
            .remove();

        layer = layer.enter()
            .append('g')
            .attr('class', 'layer-mapillary-points')
            .style('display', enabled ? 'block' : 'none')
            .merge(layer);

        if (enabled) {
            if (service && ~~context.map().zoom() >= minZoom) {
                editOn();
                update();
                service.loadPoints(context, projection);
            } else {
                editOff();
            }
        }
    }


    drawPoints.enabled = function(_) {
        if (!arguments.length) return svgMapillaryPoints.enabled;
        svgMapillaryPoints.enabled = _;
        if (svgMapillaryPoints.enabled) {
            showLayer();
        } else {
            hideLayer();
        }
        dispatch.call('change');
        return this;
    };


    drawPoints.supported = function() {
        return !!getService();
    };


    init();
    return drawPoints;
}
