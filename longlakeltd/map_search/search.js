(function($) {

	$(document).ready(function(){
		// presets
		var markers = [];
		//var bounds = build_bounds();
		var bounds = lll_object.data.bounds;
		var inv_layer = [];
		var popup = new mapboxgl.Popup({
			closeButton: false,
			closeOnClick: false,
			offset: 10,
		});
		var filters = {
			Areas: {},
			Neighborhood: {},
			Stories: {},
			Beds: {},
			Baths: {},
			SqFt: {},
			Price: {},
		};
		var hiddenFilters = {
			all: 'all',
		};
		var current_neighborhood = '';
		
		// initialize the map
		mapboxgl.accessToken = 'pk.eyJ1IjoibmVsc29uYW5kY28iLCJhIjoiY2tiOGJmemRmMDJsOTJxbGlncnN1c3VybCJ9.ykoB-j8KD8uITzkTn43pFQ';
		
		var map = new mapboxgl.Map({
			container: 'map',
			style: 'mapbox://styles/mapbox/streets-v11',
			center: [-95.3677, 29.7589],
			zoom: 5,
			minZoom: 5,
			maxZoom: 16
		});
		// set the map bounds immidiately, no flying on load
		map.fitBounds(bounds, {
			padding: {top: 50, bottom: 50, left: 50, right: 50}
		});

		// parse data into geojson arrays for the map layers
		var neighborhoods = geojson_data(lll_object.data.neighborhood);
		var neighborhoods_polygons = geojson_polygon_data(lll_object.data.neighborhood);
		var inventory = geojson_data(lll_object.data.inventory);
		var plans = geojson_data(lll_object.data.plan);
		var hoveredStateId = null;
		var waiter;
		
		map.on('load', function() {
//			build_full_polygon_layer();
			// build layers
			if (!lll_object.data.is_neighborhood_page) {
				build_neighborhoods_layer();
			}
			build_inventory_layer();
			build_plans_layer();

			// parse the hash AFTER we load the layers
			parse_hash_filters();
		});



		/*map.on('movestart', function() {
			$('#controls .waiter').show();
		});

		/*map.on('moveend', function() {
			$('#controls .waiter').show();
			if (waiter) clearTimeout(waiter);
			waiter = setTimeout(function(){
				get_visible();
				$('#controls .waiter').fadeOut();
			}, 500);
		});*/

		$(window).on('resize', function(){
			fill_screen();
		});
		setTimeout(fill_screen, 100);

		// 
		map.on('moveend', function() {
			map.on('render', afterRenderComplete);
		});

		function afterRenderComplete() {
//console.log('.');
			$('#results .waiter').show();
			if (!map.loaded()) { return }
			if (waiter) clearTimeout(waiter);
			waiter = setTimeout(function(){
				get_visible();
				$('#results .waiter').fadeOut();
			    map.off('render', afterRenderComplete);
			}, 500);
		}


		function geojson_data(input) {
			var features = [];

			$.each(input, function(k, v){
				var feature = {
					id: k,
					type: "Feature",
					properties: v,
					geometry: {
						type: "Point",
						coordinates: [
							v.lng,
							v.lat
						]
					}
				}
				feature.properties.id = k;
				features.push(feature);
			});

			return {
				type: 'FeatureCollection',
				features: features
			};
		}
		function geojson_polygon_data(input) {
			var features = [];

			$.each(input, function(k, v){

				var feature = {
					id: k,
					type: "Feature",
					properties: v,
					geometry: {
						type: "Polygon",
						coordinates: [
							[
								[v.bounds[0][0], v.bounds[0][1]],
								[v.bounds[1][0], v.bounds[0][1]],
								[v.bounds[1][0], v.bounds[1][1]],
								[v.bounds[0][0], v.bounds[1][1]]
							]
						]
					}
				}
				feature.properties.id = k;
				features.push(feature);
			});

			return {
				type: 'FeatureCollection',
				features: features
			};
		}
		
		function build_neighborhoods_layer() {
			map.loadImage(lll_object.icons_url + 'icon-community-30.png', function(error, image) {
				map.addImage('neighborhood_icon', image);
			});
			map.loadImage(lll_object.icons_url + 'icon-community-30-white.png', function(error, image) {
				map.addImage('neighborhood_icon_white', image);
			});
			map.addSource('neighborhoods', {
				'type': 'geojson',
				'data': neighborhoods
			});

			map.addLayer({
				'id': 'neighborhoods',
				'type': 'symbol',
				'source': 'neighborhoods',
				'layout': {
					'icon-image': 'neighborhood_icon',
					'icon-padding': 0,
					'icon-allow-overlap': true
				},
				'paint': {
					'icon-opacity': [
						'case',
						['boolean',['feature-state', 'hover'], false],
						1,
						0
					],
				},
				maxzoom: 13,
			});
			map.addLayer({
				'id': 'neighborhoods_hover',
				'type': 'symbol',
				'source': 'neighborhoods',
				'layout': {
					'icon-image': 'neighborhood_icon_white',
					'icon-padding': 0,
					'icon-allow-overlap': true,
				},
				'paint': {
					'icon-opacity': [
						'case',
						['boolean',['feature-state', 'hover'], false],
						0,
						1
					],
				},
				maxzoom: 13,
			});
			map.on('mouseenter', 'neighborhoods', function(e) {
				map.getCanvas().style.cursor = 'pointer';
 
				// update the feature state so the homes_over layer will show for targeted feature
				if (hoveredStateId) {
					map.setFeatureState(
						{ source: 'neighborhoods', id: hoveredStateId },
						{ hover: false }
					);
				}
				hoveredStateId = e.features[0].id;
				map.setFeatureState(
					{ source: 'neighborhoods', id: hoveredStateId },
					{ hover: true }
				);

				// build popup
				popup
				.setLngLat(e.features[0].geometry.coordinates)
				.setHTML(
					'<div class="center bold">' + e.features[0].properties.title + '</div>' + 
					'<div class="small">[ Click to zoom into neighborhood ]</div>'
				)
				.addTo(map);
			});
			map.on('mouseleave', 'neighborhoods', function() {
				map.getCanvas().style.cursor = '';
				popup.remove();
				if (hoveredStateId) {
					map.setFeatureState(
						{ source: 'neighborhoods', id: hoveredStateId },
						{ hover: false }
					);
				}
				hoveredStateId = null;
			});
			map.on('click', 'neighborhoods', function(e) {
				$('#neighborhood_field').find('select').val(e.features[0].properties.id);
				process_filters();
			});

			//map.setFilter( 'neighborhoods', Object.values(hiddenFilters) );
		}

		function build_inventory_layer() {
			map.addSource('inventory', {
				'type': 'geojson',
				'data': inventory
			});

			map.loadImage(lll_object.icons_url + 'icon-house-20-white.png', function(error, image) {
				map.addImage('inventory_icon', image);
			});
			map.loadImage(lll_object.icons_url + 'icon-house-20.png', function(error, image) {
				map.addImage('inventory_icon_white', image);
			});
			map.addLayer({
				'id': 'homes',
				'type': 'symbol',
				'source': 'inventory',
				'layout': {
					'icon-image': 'inventory_icon',
					'icon-padding': 0,
					'icon-allow-overlap': true,
				},
				'paint': {
					'icon-opacity': [
						'case',
						['boolean',['feature-state', 'hover'], false],
						0,
						1
					],
				},
				minzoom: 13,
			});
			map.addLayer({
				'id': 'homes_hover',
				'type': 'symbol',
				'source': 'inventory',
				'layout': {
					'icon-image': 'inventory_icon_white',
					'icon-padding': 0,
					'icon-allow-overlap': true,
				},
				'paint': {
					'icon-opacity': [
						'case',
						['boolean',['feature-state', 'hover'], false],
						1,
						0
					],
				},
				minzoom: 13,
			});
			map.on('mouseenter', 'homes', function(e) {
				map.getCanvas().style.cursor = 'pointer';

				// update the feature state so the homes_over layer will show for targeted feature
				if (hoveredStateId) {
					map.setFeatureState(
						{ source: 'inventory', id: hoveredStateId },
						{ hover: false }
					);
				}
				hoveredStateId = e.features[0].id;
				map.setFeatureState(
					{ source: 'inventory', id: hoveredStateId },
					{ hover: true }
				);
				
				// build popup
				popup
				.setLngLat(e.features[0].geometry.coordinates)
				.setHTML(
					'<div class="center bold">' + e.features[0].properties.title + '</div>' + 
					'<div class="center small">[ Click to highlight in results ]</div>'
				)
				.addTo(map);
			});
			map.on('mouseleave', 'homes', function() {
				// clear mouseenter settings
				map.getCanvas().style.cursor = '';
				popup.remove();
				if (hoveredStateId) {
					map.setFeatureState(
						{ source: 'inventory', id: hoveredStateId },
						{ hover: false }
					);
				}
				hoveredStateId = null;
			});

			map.on('click', 'homes', function(e) {
				// highlight and scrollto widget on left
				$('[data-home]').removeClass('highlight');
				var widget = $('[data-home='+e.features[0].id+']');
				widget.addClass('highlight');
				var top = $('#controls .results').scrollTop() + widget.position().top;
				$('#controls .results').animate({
					scrollTop: top
				});
			});
			map.setFilter( 'homes', Object.values(hiddenFilters) );
		}

		function build_plans_layer() {
			map.addSource('plans', {
				'type': 'geojson',
				'data': neighborhoods_polygons
			});
			map.addLayer({
				'id': 'plans',
				'type': 'fill',
				'source': 'plans',
				'paint': {
					'fill-color': '#00467F',
					'fill-opacity': 0
				},
				//minzoom: 13
			});

			map.setFilter( 'plans', Object.values(hiddenFilters) );
		}

		function build_full_polygon_layer() {
			map.addSource('full_polygon', {
				'type': 'geojson',
				'data': {
					'type': 'Feature',
					'geometry': {
						'type': 'Polygon',
						'coordinates': [lll_object.data.polygon]
					}
				}
			});
			map.addLayer({
				'id': 'full_polygon',
				'type': 'fill',
				'source': 'full_polygon',
				'paint': {
					'fill-color': '#ff0000',
					'fill-opacity': 0.1
				},
				//minzoom: 13
			});
		}

		function get_visible() {
			if (map.getLayer('neighborhoods') || map.getLayer('plans') || map.getLayer('homes')) {
				jQuery('.results .home_block').removeClass('on_map');
				
				// inventory
				if (map.getLayer('homes')) {
					$.each(map.queryRenderedFeatures({ layers: ['homes'] }), function(k,v){
						jQuery('.results .home_block[data-home='+v.properties.id+']').addClass('on_map');
					});
				}

				// neighborhoods
				if (map.getLayer('neighborhoods')) {
					$.each(map.queryRenderedFeatures({ layers: ['neighborhoods'] }), function(k,v){
						jQuery('.results .home_block[data-neighborhood='+v.properties.id+']').addClass('on_map');
					});
				}

				// neighborhoods
				if (map.getLayer('plans')) {
					$.each(map.queryRenderedFeatures({ layers: ['plans'] }), function(k,v){
						jQuery('.results .new_home[data-neighborhood='+v.properties.id+']').addClass('on_map');
					});
				}
			}

			// if inventory is hiding everything, show none prompt
			if ($('#inventory_result_section').children(':visible').length == 0) {
				$('#inventory_noresult').show();
			}else {
				$('#inventory_noresult').hide();
			}

			// if plans is hiding everything, show none prompt
			if ($('#plans_result_section').children(':visible').length == 0) {
				$('#plans_noresult').show();
			}else {
				$('#plans_noresult').hide();
			}

		}


		function build_map_filter(id, name, value, comparison = "==") {
			if (value) {
				hiddenFilters[id] = [comparison, name, value];
			}else {
				delete hiddenFilters[id];
			}
		}

		function fill_screen() {
			/*if ($('#lll_search').hasClass('full_screen')) {
				var height = $(window).height();
				height -= $('#wpadminbar').outerHeight(true);
				height -= $('.elementor-location-header').outerHeight(true);
				height -= $('.elementor-location-footer').outerHeight(true);
				$('#lll_search').height(height);
			}*/
			map.resize();
		}

		/*function build_bounds() {
			var bounds = [[null,null],[null,null]];
			// bounds are based on neighborhoods
			$.each(lll_object.data.neighborhood, function(k, v){
				if (bounds[0][0] == null || bounds[0][0] > v.lng) bounds[0][0] = v.lng;
				if (bounds[0][1] == null || bounds[0][1] > v.lat) bounds[0][1] = v.lat;
				if (bounds[1][0] == null || bounds[1][0] < v.lng) bounds[1][0] = v.lng;
				if (bounds[1][1] == null || bounds[1][1] < v.lat) bounds[1][1] = v.lat;
			});
			// and inventory
			$.each(lll_object.data.inventory, function(k, v){
				if (bounds[0][0] == null || bounds[0][0] > v.lng) bounds[0][0] = v.lng;
				if (bounds[0][1] == null || bounds[0][1] > v.lat) bounds[0][1] = v.lat;
				if (bounds[1][0] == null || bounds[1][0] < v.lng) bounds[1][0] = v.lng;
				if (bounds[1][1] == null || bounds[1][1] < v.lat) bounds[1][1] = v.lat;
			});

			return bounds;
		}*/

		function flyto_full() {
			map.fitBounds(bounds, {
				padding: {top: 50, bottom: 50, left: 50, right: 50},
				linear: false,
				duration: 2000
			});
		}

		function flyto_neighborhood(nid) {
			current_neighborhood = nid;
			if (nid == '') {
				flyto_full();
			}else {
				// if we have bounds for a neighborhood, use them. Otherwise just zoome in.
				if (lll_object.data.neighborhood[nid].bounds[0][0] != null) {
					map.fitBounds(lll_object.data.neighborhood[nid].bounds, {
						padding: {top: 50, bottom: 50, left: 50, right: 50},
						linear: false,
						duration: 2000
					});
				}else {
					map.flyTo({
						center: [lll_object.data.neighborhood[nid].lng, lll_object.data.neighborhood[nid].lat],
						zoom: 15,
						duration: 500,
					});
				}
			}
		}

		$(document).on('click', '#clear_filters_button', function(){
			// clear all filters
			$('#lll_search_filters').trigger('reset');
			flyto_full();
			process_filters();
		});

		$(document).on('click', '#edit_filters_button', function(){
			$('#lll_search_overlay').css('display', 'flex');
		});

		$(document).on('click', '#close_filters_button', function(){
			$('#lll_search_overlay').fadeOut();
		});

		$(document).on('click', '.filter_button', function(){
			var f = $(this).data('field');
			$('#' + f).find('select').val('');
			$(this).remove();
			process_filters();
		});

		$(document).on('submit', '#lll_search_filters', function(){
			process_filters();
			return false;
		});

		$(window).on('hashchange', function(e) {
			parse_hash_filters();
		});

		$(document).on('click','.results_handle', function(e){
			if ($(this).is(':visible')) {
				if ($('#results').hasClass('open')) {
					$('#results').removeClass('open');
				}else {
					$('#results').addClass('open');
				}
			}
		});


		function process_filters() {
			// start by rebuilding the hash
			var hashes = {};
			$('.current_filters .filter_button').remove();
			var form = $('#lll_search_filters');
			
			// parse the form
			$.each(form.find(':input'), function(k, v){
				var field = $(v);
				var value = field.val();
				if (field.val()) {
					// build hashes
					hashes[field.data('hashkey')] = value;
				}
			});

			// update hash
			if ($.isEmptyObject(hashes)) {
				history.replaceState(null, null, ' ');
			}else {
				window.location.hash = $.map(Object.getOwnPropertyNames(hashes), function(k) { return [k, hashes[k]].join('=') }).join('&');
			}
			

			// parse the form
			$.each(form.serializeObject(), function(k, v){
				// is there a value
				if (Object.values(v).join('')) {
/* EVENTUALLY - I want to merge the form processing into a single loop

					// is value an array
					if (jQuery.isPlainObject(v)) {
						$.each(v, function(k2, v2){
							console.log(k);
							console.log(k2);
						});

					}else {

					}*/

					// build the filter buttons
					var fb = $("<div>");
					fb.addClass('filter_button');
					fb.data('field', form.find("[name^=" + k + "]").parents('fieldset').attr('id'));
					
					if (jQuery.isPlainObject(v)) {
					//if ('min' in v && 'max' in v) {
						var l = {};
						l.min = v.min ? form.find("[name='" + k + "[min]'] option:selected").text() : '*';
						l.max = v.max ? form.find("[name='" + k + "[max]'] option:selected").text() : '*';
						if (k == "Price") {
							// we don't show the field name for Price
							fb.html( Object.values(l).join('-') );
						}else {
							fb.html( k + " (" + Object.values(l).join('-') + ")" );
						}
					}else {
						fb.html( form.find("[name='" + k + "'] option:selected").text() );
					}
					$('.current_filters').append(fb);
				}
			});

			//window.location.hash = hash;


			// reset the (map) hidden filters
			hiddenFilters = {
				all: 'all',
			};

			// unhide all plans to reset filters
			$('.home_block').removeClass('filter_hide');

			// parse all form fields
			$.each(form.find('select'), function(k, v){
				var field = $(this);
				// apply the filters to the map
				var name = field.data('filter');
				var comparison = '==';
				if (field.data('comparison')) {
					comparison = field.data('comparison');
				}
				// build  the (map) hidden filters
				build_map_filter(this.id, name, field.val(), comparison);

				// The get_visible function will handle inventory, but we need to parse plans ourselves
				// filters are inclusive, so if even one doesn't match, we hide the plan
				if (field.val()) {
					$('.home_block').each(function(){
					//$('[data-plan]').each(function(){
						var d = $(this).data(name);
						if ( d ) {
							var r = eval(d + comparison + field.val());
							if (r == false) {
								$(this).addClass('filter_hide');
							}
						}else {
							$(this).addClass('filter_hide');
						}
					});
				}
			});

			// apply  the (map) hidden filters
			if (map) {
				/*if (map.getLayer('neighborhoods')) {
					map.setFilter( 'neighborhoods', Object.values(hiddenFilters) );
					map.setFilter( 'neighborhoods_hover', Object.values(hiddenFilters) );
				}*/
				if (map.getLayer('plans')) {
					map.setFilter( 'plans', Object.values(hiddenFilters) );
				}
				if (map.getLayer('homes')) {
					map.setFilter( 'homes', Object.values(hiddenFilters) );
					map.setFilter( 'homes_hover', Object.values(hiddenFilters) );
				}
			}



			// if the neighborhood value changes, we need to move the map!
			if (current_neighborhood != form.find('#filter_neighborhood').val()) {
				current_neighborhood = form.find('#filter_neighborhood').val();
				flyto_neighborhood(current_neighborhood);
			}

			$('#lll_search_overlay').fadeOut();

		}

		function build_filters() {
			$('.edit_filters fieldset').removeClass('active');
			$('.current_filters .filter_button').remove();
			
			$('.edit_filters fieldset').each(function(){
				var abbr = $(this).data('abbr');
				if (abbr == 'Neighborhood') {
					filters[abbr].val = $(this).find('select').val();
					filters[abbr].label = $(this).find('select option:selected').text();
				}else if (abbr == 'Stories') {
					filters[abbr].val = $(this).find('select').val();
					filters[abbr].label = $(this).find('select option:selected').text();
				}else {

				}
				
			});

//console.log(filters);
			/*$.each(filters, function(abbr, fdata){
				// Neighborhood and Stories are single entry, and show label instead of abbr (value)
				if (abbr == 'Neighborhood' || abbr == 'Stories') {

				}else {
					fdata
					$(abbr.toLowerCase() + '_field').addClass('active');
				}


			});


/*			filters.Neighborhood.val = $('#filter_neighborhood').val();
			filters.Stories.val = $('#filter_stories').val();
			filters.Beds.val = $('#filter_min_bedrooms').val() + '-' + $('#filter_max_bedrooms').val();
			filters.Baths.val = $('#filter_min_bathrooms').val() + '-' + $('#filter_max_bathrooms').val();
			filters.SqFt.val = $('#filter_min_square_feet').val() + '-' + $('#filter_max_square_feet').val();
			filters.Price.val = $('#filter_min_price').val() + '-' + $('#filter_max_price').val();

			if (filters.Neighborhood.val != '*') {
				$('#neighborhood_field').addClass('active');
				$('.current_filters').append('<div class="filter_button">' + filters.Neighborhood.val + '</div>');
			}
			if (filters.Stories.val != '*') {
				$('#stories_field').addClass('active');
				$('.current_filters').append('<div class="filter_button">' + filters.Stories.val + '</div>');
			}
			if (filters.Beds.val != '*-*') {
				$('#beds_field').addClass('active');
				$('.current_filters').append('<div class="filter_button">' + filters.Beds.val + ' Beds</div>');
			}
			if (filters.Baths.val != '*-*') {
				$('#baths_field').addClass('active');
				$('.current_filters').append('<div class="filter_button">' + filters.Baths.val + ' Baths</div>');
			}
			if (filters.SqFt.val != '*-*') {
				$('#sqft_field').addClass('active');
				$('.current_filters').append('<div class="filter_button">' + filters.SqFt.val + ' SqFt</div>');
			}
			if (filters.Price.val != '*-*') {
				$('#price_field').addClass('active');
				$('.current_filters').append('<div class="filter_button">' + filters.Price.val + ' Price</div>');
			}*/


/*

			var fb = {};
			$('.filter').each(function(k, v){
console.log($(v).val());
				if ($(v).val()) {
					$(v).parents('fieldset').addClass('active');
					
					var abbr = '';
					if ( $(v).data('filter') == 'bedrooms' ) {
						abbr = 'beds';
						val = $(v).val();
					}
					if (fb[abbr]) {
						fb[abbr].append( '-' + val );
					}else {
						fb[abbr] = $('<div>');
						fb[abbr].addClass('filter_button');
						fb[abbr].html( abbr + ' ' + val );
					}
				}
			});
			$.each(fb, function(k, v){
				$('.current_filters').append(v);
			});
*/			

		}

		// this only happens when a page is first loaded, or reloaded
		function parse_hash_filters() {
			var hashes = $(location).prop('hash').substr(1).split('&');
			if (hashes != [""]) {
				$.each(hashes, function(k, v){
					var kv = v.split('=');
					$('[data-hashkey=\"' + kv[0] + '\"]').val(kv[1]);
				});
				process_filters();
			}
		}

	});

})(jQuery);


(function($){
    $.fn.serializeObject = function(){

        var self = this,
            json = {},
            push_counters = {},
            patterns = {
                "validate": /^[a-zA-Z][a-zA-Z0-9_]*(?:\[(?:\d*|[a-zA-Z0-9_]+)\])*$/,
                "key":      /[a-zA-Z0-9_]+|(?=\[\])/g,
                "push":     /^$/,
                "fixed":    /^\d+$/,
                "named":    /^[a-zA-Z0-9_]+$/
            };


        this.build = function(base, key, value){
            base[key] = value;
            return base;
        };

        this.push_counter = function(key){
            if(push_counters[key] === undefined){
                push_counters[key] = 0;
            }
            return push_counters[key]++;
        };

        $.each($(this).serializeArray(), function(){

            // Skip invalid keys
            if(!patterns.validate.test(this.name)){
                return;
            }

            var k,
                keys = this.name.match(patterns.key),
                merge = this.value,
                reverse_key = this.name;

            while((k = keys.pop()) !== undefined){

                // Adjust reverse_key
                reverse_key = reverse_key.replace(new RegExp("\\[" + k + "\\]$"), '');

                // Push
                if(k.match(patterns.push)){
                    merge = self.build([], self.push_counter(reverse_key), merge);
                }

                // Fixed
                else if(k.match(patterns.fixed)){
                    merge = self.build([], k, merge);
                }

                // Named
                else if(k.match(patterns.named)){
                    merge = self.build({}, k, merge);
                }
            }

            json = $.extend(true, json, merge);
        });

        return json;
    };
})(jQuery);