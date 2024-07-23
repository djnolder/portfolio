<?php

namespace lll_admin;

/**
 * search
 *
 * This class is used to encapsulate the methods needed to handle the search map's data
 *
 * @package lll_admin
 */
class search
{

    /**
     * @var self Singleton instance of this class.
     */
    private static self $instance;

    /**
     * @var array $data Fully formatted data used by the search map.
     */
    public array $data;

    /**
     * Singleton method used to make sure only one instance of this class is created.
     *
     * @return self singletonArray
     */
    public static function getInstance(): self
    {
        if (self::$instance == null) {
            self::$instance = new static;
        }
        return self::$instance;
    }

    /**
     * __construct
     *
     * Method used to set WordPress actions and shortcodes.
     */
    protected function __construct()
    {
        // load the search scripts
        add_action('wp_enqueue_scripts', array($this, 'load_search_scripts'));

        // set the shortcodes
        add_shortcode('lll_search_field', array($this, 'show_search_field'));
        add_shortcode('lll_search', array($this, 'show_search_page'));
    }

    /**
     * get_data
     *
     * Method used to query the database for all data needed by the search map.
     *
     * @return array
     */
    private function get_data(): array
    {
        /**
         * @var
         */
        global $wpdb,
               $post;

        $output = [];

        // preset bounds to downtown houston
        $output['bounds'] = [[-95.3677, 29.7589], [-95.3677, 29.7589]];

        // set a variable to know if we are on a neighborhood page
        $output['is_neighborhood_page'] = ($post->post_type == "neighborhood");

        //execute the query
        $res = $wpdb->get_results("SELECT p.ID, p.post_type, p.post_title, pm.meta_key, pm.meta_value,
			(
				SELECT pm3.meta_value FROM {$wpdb->postmeta} AS pm2
				JOIN {$wpdb->postmeta} AS pm3 ON pm3.post_id = pm2.meta_value
				WHERE pm2.post_id = p.ID
				AND pm2.meta_key = '_thumbnail_id'
				AND pm3.meta_key = '_wp_attached_file'
			) AS image
			FROM {$wpdb->posts} AS p
			LEFT JOIN {$wpdb->postmeta} AS pm ON p.ID = pm.post_id
			WHERE p.post_type IN ('neighborhood','inventory','plan','series')
			AND p.post_status = 'publish'
			AND pm.meta_key IN ('location_verified','location','square_feet','stories','bedrooms','bathrooms','status','price','plan','neighborhood','neighborhoods','plans','series','inventory', 'area')
			ORDER BY p.post_type, p.post_title
		");

        // parse the returned database data
        foreach ($res as $r) {
            $output[$r->post_type][$r->ID]['url'] = get_post_permalink($r->ID);
            $output[$r->post_type][$r->ID]['title'] = $r->post_title;
            if ($r->image) {
                $output[$r->post_type][$r->ID]['image'] = wp_get_upload_dir()['baseurl'] . '/' . $r->image;
            } else {
                $output[$r->post_type][$r->ID]['image'] = wp_get_upload_dir()['baseurl'] . '/2020/02/image-comins-soon.png';
            }

            // add the neighborhood id to all outputs
            if ($r->post_type == 'neighborhood') {
                $output[$r->post_type][$r->ID]['neighborhood'] = $r->ID;
                $output[$r->post_type][$r->ID]['bounds'] = [[null, null], [null, null]];
            }

            // watch for status, and set readable value
            if ($r->meta_key == 'status') {
                $statuses = [
                    'construction' => 'Under Construction',
                    'ready' => 'Ready For Move In',
                    'pending' => 'Pending Sale',
                    'no' => 'No Longer Available'
                ];
                if (isset($statuses[$r->meta_value])) {
                    $r->meta_value = $statuses[$r->meta_value];
                }
            }

            // watch the location to set map bounds
            if ($r->meta_key == 'location') {
                $v = unserialize($r->meta_value);
                if (is_array($v)) {
                    $output[$r->post_type][$r->ID]['lng'] = $v['lng'];
                    $output[$r->post_type][$r->ID]['lat'] = $v['lat'];

                    // update full map bounds based on all data
                    $b = $output['bounds'];
                    if (empty($b[0][0]) || $b[0][0] > $v['lng']) $b[0][0] = $v['lng'];
                    if (empty($b[0][1]) || $b[0][1] > $v['lat']) $b[0][1] = $v['lat'];
                    if (empty($b[1][0]) || $b[1][0] < $v['lng']) $b[1][0] = $v['lng'];
                    if (empty($b[1][1]) || $b[1][1] < $v['lat']) $b[1][1] = $v['lat'];
                    $output['bounds'] = $b;
                }
            } else {
                $output[$r->post_type][$r->ID][$r->meta_key] = $r->meta_value;
            }
        }

        $output['polygon'] = [
            [$output['bounds'][0][0], $output['bounds'][0][1]],
            [$output['bounds'][1][0], $output['bounds'][0][1]],
            [$output['bounds'][1][0], $output['bounds'][1][1]],
            [$output['bounds'][0][0], $output['bounds'][1][1]]
        ];

        foreach ($output['neighborhood'] as &$neighborhood) {
            // default bounds for neighborhoods to their primary location
            if (!empty($neighborhood['lat']) && !empty($neighborhood['lng'])) {
                $neighborhood['bounds'] = [
                    [
                        $neighborhood['lng'],
                        $neighborhood['lat']
                    ], [
                        $neighborhood['lng'],
                        $neighborhood['lat']
                    ]
                ];
            }
        }

        // complete the neighborhood bounds based on inventory in that neighborhood
        foreach ($output['inventory'] as $id => $inv) {
            // if location_verified is not set, we don't show that inventory...
            /*			if (!$inv['location_verified']) {
                            unset($output['inventory'][$id]);
                        }
            */
            if (!empty($inv['lng']) && !empty($inv['lat'])) {
                $b = $output['neighborhood'][$inv['neighborhood']]['bounds'];
                if ($b[0][0] > $inv['lng']) $b[0][0] = $inv['lng'];
                if ($b[0][1] > $inv['lat']) $b[0][1] = $inv['lat'];
                if ($b[1][0] < $inv['lng']) $b[1][0] = $inv['lng'];
                if ($b[1][1] < $inv['lat']) $b[1][1] = $inv['lat'];
                $output['neighborhood'][$inv['neighborhood']]['bounds'] = $b;
            }
        }

        $prices = $wpdb->get_results("SELECT pr.*,
			(SELECT ID FROM {$wpdb->posts} WHERE post_title = pr.plan AND post_type = 'plan' AND post_status = 'publish') AS plan_id,
			(SELECT ID FROM {$wpdb->posts} WHERE post_title = pr.neighborhood AND post_type = 'neighborhood' AND post_status = 'publish') AS neighborhood_id
			FROM {$wpdb->prefix}prices AS pr
		");

        $output['prices'] = [];

        foreach ($prices as $p) {
            $output['prices'][$p->plan][$p->neighborhood] = $p->price;
            if (isset($output['plan'][$p->plan_id])) {
                $output['plan'][$p->plan_id]['prices'][$p->neighborhood] = $p->price;
            }
        }

        $areas = get_terms(array(
            'taxonomy' => 'areas',
            'hide_empty' => false
        ));
        foreach ($areas as $area) {
            $output['areas'][$area->term_id] = $area->name;
        }

        // if we are on a neighborhood page, we need to remove anything NOT associated to that neighborhood
        if ($post->post_type == "neighborhood") {
            foreach ($output as $t => $d) {
                if (is_array($d)) {
                    foreach ($d as $k => $v) {
                        if ($t == 'neighborhood' && $k != $post->ID) {
                            unset($output[$t][$k]);
                        }
                        if ($t == 'inventory' && $v['neighborhood'] != $post->ID) {
                            unset($output[$t][$k]);
                        }
                        if ($t == 'plan') {

                        }
                        if ($t == 'series') {

                        }
                    }
                }
            }
        }

        // parse output to set max and min values for neighborhoods based on plans and inventory IN that neighborhood, also add ids to the neighborhood
        foreach ($output['neighborhood'] as $key => &$n) {
            $series = unserialize($n['series']);
            $stats = array(
                'bedrooms' => array(),
                'bathrooms' => array(),
                'stories' => array(),
                'square_feet' => array()
            );
            $n['plans'] = array();
            $inventory = $n['inventory'];
            $n['inventory'] = array();
            foreach ($series as $s) {
                if (isset($output['series'][$s]['plans'])) {
                    $plans = unserialize($output['series'][$s]['plans']);
                    foreach ($plans as $p) {
                        // build the stats
                        foreach ($stats as $stat_key => &$stat) {
                            if (isset($output['plan'][$p][$stat_key])) {
                                if (empty($stat[0]) || ($stat[0] >= $output['plan'][$p][$stat_key])) {
                                    $stat[0] = $output['plan'][$p][$stat_key];
                                }
                                if (empty($stat[1]) || ($stat[1] <= $output['plan'][$p][$stat_key])) {
                                    $stat[1] = $output['plan'][$p][$stat_key];
                                }
                            }
                        }
                        // add plans to neighborhoods
                        $n['plans'][] = $p;
                    }
                }
            }

            if ($inventory = unserialize($inventory)) {
                foreach ($inventory as $i) {
                    if (isset($output['inventory'][$i])) {
                        foreach ($stats as $stat_key => &$stat) {
                            if (empty($stat[0]) || ($stat[0] >= $output['inventory'][$i][$stat_key])) {
                                $stat[0] = $output['inventory'][$i][$stat_key];
                            }
                            if (empty($stat[1]) || ($stat[1] <= $output['inventory'][$i][$stat_key])) {
                                $stat[1] = $output['inventory'][$i][$stat_key];
                            }
                        }
                    }
                    // add plans to neighborhoods
                    $n['inventory'][] = $i;
                }
            }

            $n = array_merge($n, $stats);
        }

        // sort inventory by status
        $status = array_column($output['inventory'], 'status');
        array_multisort($status, SORT_ASC, $output['inventory']);

        return $output;
    }

    /**
     * @param $lat1
     * @param $lng1
     * @param $lat2
     * @param $lng2
     * @return float|int
     */
    private function getDistance($lat1, $lng1, $lat2, $lng2)
    {
        $dLat = deg2rad($lat2 - $lat1);
        $dLon = deg2rad($lng2 - $lng1);

        $a = sin($dLat / 2) * sin($dLat / 2) + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLon / 2) * sin($dLon / 2);
        $c = 2 * asin(sqrt($a));
        $d = 3959 * $c;

        return $d;
    }

    /**
     * @return void
     */
    public function load_search_scripts()
    {
        wp_register_style('lll_search', LLL_ADMIN_URL . 'assets/stylesheet/search.css', [], LLL_VER);
        wp_register_script('lll_search', LLL_ADMIN_URL . 'assets/javascript/search.js', array('jquery', 'mapbox'), LLL_VER);

        wp_register_script('lll_search_dropdown', LLL_ADMIN_URL . 'assets/javascript/search_dropdown.js', array('jquery'), LLL_VER);

        // we're going to go ahead and load search stylesheet
        wp_enqueue_style('lll_search');
        wp_enqueue_script('lll_search_dropdown');
        wp_localize_script('lll_search_dropdown', 'lll_object', array(
            'site_url' => get_site_url(),
        ));
    }

    /**
     * @return void
     */
    private function load_scripts()
    {
        global $post;
        wp_enqueue_style('mapbox');
        wp_enqueue_script('mapbox');
        wp_enqueue_script('lll_search');

        wp_localize_script('lll_search', 'lll_object', array(
            'icons_url' => LLL_ADMIN_URL . 'assets/images/',
            'data' => $this->data,
        ));
    }

    /**
     * @return void
     */
    public function show_search_page()
    {
        global $twig, $post;
        $this->data = get_transient('lll_search_data');

        if (false === $this->data) {
            $this->data = $this->get_data();
            set_transient('lll_search_data', $this->data, 6 * HOUR_IN_SECONDS);
        }
        $this->load_scripts();

        $data = array(
            'data' => $this->data
        );
        echo $twig->render('search.tpl', $data);
    }

    // search field functions

    /**
     * @return void
     */
    static function show_search_field()
    {
        global $twig;

        $data = array(
            'areas' => self::get_areas_list(),
            'neighborhoods' => self::get_neighborhoods_list(),
        );

        echo $twig->render('search_field.tpl', $data);
    }

    /**
     * @return array
     */
    static function get_areas_list()
    {
        $areas = [];
        $terms = get_terms(array(
            'taxonomy' => 'areas',
            'hide_empty' => false,
            'order_by' => 'name',
            'order' => 'ASC'
        ));

        foreach ($terms as $term) {
            $areas[$term->slug] = $term->name;
        }

        return $areas;
    }

    /**
     * @return array
     */
    static function get_neighborhoods_list()
    {
        global $wpdb;

        $neighborhoods = array();

        $posts = get_posts(array(
            'post_type' => 'neighborhood',
            'post_status' => 'publish',
            'posts_per_page' => -1,
            'order_by' => 'title',
            'order' => 'ASC'
        ));

        foreach ($posts as $post) {
            $neighborhoods[$post->ID] = $post->post_title;
        }

        return $neighborhoods;
    }

}