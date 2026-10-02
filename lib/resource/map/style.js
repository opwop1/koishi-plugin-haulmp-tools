window.__STYLE__ = (function () {
  var t = '/proxy'
  var base = { source: 'game', 'source-layer': 'ets2' }
  var font = ['Open Sans Regular']
  var typeEq = function (v) { return ['==', ['get', 'type'], v] }
  var roadFilter = ['all', typeEq('road'), ['!=', ['get', 'roadType'], 'train'], ['!=', ['get', 'hidden'], true]]
  var casingWidth = ['interpolate', ['exponential', 1.5], ['zoom'], 3, 0.7, 14, 28, 16, 140]
  var roadWidth = ['interpolate', ['exponential', 1.5], ['zoom'], 3, 0.546, 14, 21.84, 16, 109.2]
  var areaColors = ['match', ['get', 'color'], 0, '#9aa7af', 1, '#3a4348', 2, '#303a40', 3, '#2d3b35', 4, '#453c39', 5, '#34463a', 6, '#293b47', 7, '#444940', 8, '#3c4046', '#394249']
  var labelPaint = { 'text-color': '#d2dce3', 'text-halo-color': '#253139', 'text-halo-width': 1.4 }
  var layers = [
    { id: 'background', type: 'background', paint: { 'background-color': '#29333a' } },
    { id: 'water', source: 'water', type: 'fill', paint: { 'fill-color': '#15232e' } },
    { id: 'borders', source: 'countries', type: 'line', paint: { 'line-color': '#6a7c88', 'line-width': 0.8, 'line-opacity': 0.4, 'line-dasharray': [3, 4] } },
    { ...base, id: 'areas', type: 'fill', minzoom: 7, filter: typeEq('mapArea'), layout: { 'fill-sort-key': ['coalesce', ['get', 'zIndex'], 0] }, paint: { 'fill-color': areaColors, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0.4, 10, 1] } },
    { ...base, id: 'prefabs', type: 'fill', minzoom: 7, filter: typeEq('prefab'), layout: { 'fill-sort-key': ['coalesce', ['get', 'zIndex'], 0] }, paint: { 'fill-color': areaColors, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0.4, 10, 1] } },
    { ...base, id: 'road-casing', type: 'line', filter: roadFilter, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#202a31', 'line-width': casingWidth, 'line-gap-width': 0 } },
    { ...base, id: 'roads', type: 'line', filter: roadFilter, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['match', ['get', 'roadType'], 'freeway', '#b4bec2', 'divided', '#a8b4bb', '#9aa7af'], 'line-width': roadWidth } },
    { ...base, id: 'ferries', type: 'line', filter: ['any', typeEq('ferry'), typeEq('train')], paint: { 'line-color': '#617e94', 'line-width': 1, 'line-opacity': ['interpolate', ['linear'], ['zoom'], 3, 0.3, 7, 0.65], 'line-dasharray': [2, 5] } },
    { ...base, id: 'countries', type: 'symbol', maxzoom: 7, filter: typeEq('country'), layout: { 'text-field': ['upcase', ['get', 'name']], 'text-font': font, 'text-size': 12, 'text-letter-spacing': 0.12 }, paint: { 'text-color': '#99acb9', 'text-halo-color': '#29333a', 'text-halo-width': 1.5 } },
    { ...base, id: 'road-numbers', type: 'symbol', minzoom: 8, filter: ['all', typeEq('poi'), ['==', ['get', 'poiType'], 'road']], layout: { 'icon-image': ['get', 'sprite'], 'icon-size': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 12, 0.72], 'icon-padding': 26 } },
    { ...base, id: 'cities', type: 'symbol', minzoom: 3.6, filter: typeEq('city'), layout: { 'text-field': ['get', 'name'], 'text-font': font, 'text-size': ['interpolate', ['linear'], ['zoom'], 4, 11, 7, 13, 11, 16], 'text-padding': 10, 'symbol-sort-key': ['coalesce', ['get', 'scaleRank'], 10] }, paint: labelPaint },
    { ...base, id: 'poi-fuel', type: 'symbol', minzoom: 9, filter: ['all', typeEq('poi'), ['==', ['get', 'category'], 'fuel']], layout: { 'icon-image': ['get', 'sprite'], 'icon-size': ['interpolate', ['linear'], ['zoom'], 9, 0.65, 12, 0.9, 16, 1.1], 'icon-padding': 7, 'icon-allow-overlap': false } },
    { ...base, id: 'poi-rest', type: 'symbol', minzoom: 9, filter: ['all', typeEq('poi'), ['==', ['get', 'category'], 'rest']], layout: { 'icon-image': ['get', 'sprite'], 'icon-size': ['interpolate', ['linear'], ['zoom'], 9, 0.65, 12, 0.9, 16, 1.1], 'icon-padding': 7, 'icon-allow-overlap': false } },
    { ...base, id: 'poi-service', type: 'symbol', minzoom: 9, filter: ['all', typeEq('poi'), ['==', ['get', 'category'], 'service']], layout: { 'icon-image': ['get', 'sprite'], 'icon-size': ['interpolate', ['linear'], ['zoom'], 9, 0.65, 12, 0.9, 16, 1.1], 'icon-padding': 7, 'icon-allow-overlap': false } },
    { ...base, id: 'poi-company', type: 'symbol', minzoom: 10, filter: ['all', typeEq('poi'), ['==', ['get', 'category'], 'company']], layout: { 'icon-image': ['get', 'sprite'], 'icon-size': ['interpolate', ['linear'], ['zoom'], 9, 0.65, 12, 0.9, 16, 1.1], 'icon-padding': 7, 'icon-allow-overlap': false } },
    { ...base, id: 'poi-garage', type: 'symbol', minzoom: 9, filter: ['all', typeEq('poi'), ['==', ['get', 'category'], 'garage']], layout: { 'icon-image': ['get', 'sprite'], 'icon-size': ['interpolate', ['linear'], ['zoom'], 9, 0.65, 12, 0.9, 16, 1.1], 'icon-padding': 7, 'icon-allow-overlap': false } },
    { ...base, id: 'poi-dealer', type: 'symbol', minzoom: 9, filter: ['all', typeEq('poi'), ['==', ['get', 'category'], 'dealer']], layout: { 'icon-image': ['get', 'sprite'], 'icon-size': ['interpolate', ['linear'], ['zoom'], 9, 0.65, 12, 0.9, 16, 1.1], 'icon-padding': 7, 'icon-allow-overlap': false } },
    { ...base, id: 'poi-ferry', type: 'symbol', minzoom: 9, filter: ['all', typeEq('poi'), ['==', ['get', 'category'], 'ferry']], layout: { 'icon-image': ['get', 'sprite'], 'icon-size': ['interpolate', ['linear'], ['zoom'], 9, 0.65, 12, 0.9, 16, 1.1], 'icon-padding': 7, 'icon-allow-overlap': false } },
    { ...base, id: 'poi-other', type: 'symbol', minzoom: 9, filter: ['all', typeEq('poi'), ['==', ['get', 'category'], 'other']], layout: { 'icon-image': ['get', 'sprite'], 'icon-size': ['interpolate', ['linear'], ['zoom'], 9, 0.65, 12, 0.9, 16, 1.1], 'icon-padding': 7, 'icon-allow-overlap': false } },
    { ...base, id: 'place-labels', type: 'symbol', minzoom: 12.5, filter: ['all', typeEq('poi'), ['has', 'label']], layout: { 'text-field': ['get', 'label'], 'text-font': font, 'text-size': 11, 'text-anchor': 'top', 'text-offset': [0, 1.5], 'text-max-width': 13 } , paint: labelPaint },
  ]
  return {
    version: 8,
    glyphs: t + '/fonts/{fontstack}/{range}.pbf',
    sprite: t + '/sprites-nordic',
    sources: {
      game: { type: 'vector', tiles: [t + '/tiles/{z}/{x}/{y}.pbf?v=160-roads-20260912'], minzoom: 0, maxzoom: 14 },
      water: { type: 'geojson', data: t + '/water.geojson' },
      countries: { type: 'geojson', data: t + '/countries.geojson' },
    },
    layers: layers,
  }
})()
