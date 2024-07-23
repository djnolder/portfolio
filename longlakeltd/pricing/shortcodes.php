<?php
namespace lll_admin;

class shortcodes {

	private static $instance = null;

	public static function getInstance() {
		if (self::$instance == null) {
			self::$instance = new static;
		}
		return self::$instance;
	}

	protected function __construct() {

		add_shortcode( 'lll_price', array( $this, 'lll_price' ) );
		
		add_shortcode( 'lll_phone', array( $this, 'lll_phone' ) );

		add_shortcode( 'lll_count', array( $this, 'lll_count' ) );

		add_shortcode( 'lll_neighborhood_map', array( $this, 'lll_neighborhood_map' ) );

	}

	public function lll_count( $atts = array(), $content = null, $tag = '' ) {
		if (empty($atts['cpt'])) {
			return false;
		}

		return wp_count_posts( $atts['cpt'] )->publish;
	}


	public function lll_price() {
		$lll_prices = prices_model::getInstance();

		$ref_neighborhood = null;

		setlocale(LC_MONETARY, 'en_US');
		$formatter = new \NumberFormatter('en_US', \NumberFormatter::CURRENCY);
		numfmt_set_attribute($formatter, \NumberFormatter::MAX_FRACTION_DIGITS, 0);
		// are we in an inventory widget or page
		if (get_post_type() == 'inventory') {
			// inventory mode simply pulls the price from the ACF field
			$price = get_field('price');
			if ( $price > 0 ) {
				return $formatter->formatCurrency($price, 'USD');
			}
		}elseif (get_post_type() == 'neighborhood') {
			global $post;

			$prices = $lll_prices->get_prices( $post->post_title );
			$price_low = $price_high = 0;
			if (!is_array($prices)) {
				return false;
			}

			foreach ($prices as $price) {
				if ($price_low > $price || $price_low == 0) {
					$price_low = $price;
				}
				if ($price_high < $price) {
					$price_high = $price;
				}
			}
			if ($price_low > 0 && $price_high > 0) {
				if ($price_low == $price_high) {
					return $formatter->formatCurrency($price_low, 'USD');
				}else {
					return $formatter->formatCurrency($price_low, 'USD') . " &ndash; " . $formatter->formatCurrency($price_high, 'USD');
				}
			}
		}elseif (get_post_type() == 'plan') {
			$current = $previous = ['type'=>null, 'name'=>null, 'title'=>null];

			$current = $this->get_url_data( $_SERVER['REQUEST_URI'] );

			if ('neighborhood' == $current['type']) {
				// plan widgets on neighborhood pages show single price
				$neighborhood = get_page_by_path($current['name'], OBJECT, 'neighborhood');
				$current['title'] = $neighborhood->post_title;
				$prices = $lll_prices->get_prices( $current['title'], get_the_title() );
			}else {
				$prices = $lll_prices->get_prices( null, get_the_title() );
			}

			if ($prices) {
				$price_low = $prices[0];
				$price_high = isset($prices[1])?$prices[1]:$prices[0];
			}else {
				$price_low = 0;
				$price_high = 0;
			}

			if ($price_low > 0 && $price_high > 0) {
				if ($price_low == $price_high) {
					$out = $formatter->formatCurrency($price_low, 'USD');
				}else {
					$out = $formatter->formatCurrency($price_low, 'USD') . " &ndash; " . $formatter->formatCurrency($price_high, 'USD');
				}

				if (isset($_SERVER['HTTP_REFERER'])) {
					$previous = $this->get_url_data( $_SERVER['HTTP_REFERER'] );

					// check if we are on a plan page and came from a neighborhood page
					if ( $current['type'] == 'plan' && $previous['type'] == 'neighborhood' ) {
						$neighborhood = get_page_by_path($previous['name'], OBJECT, 'neighborhood');
						$previous['title'] = $neighborhood->post_title;

						// show single price when coming from a neighborhood page
						$prices = $lll_prices->get_prices( $previous['title'], get_the_title() );
						if ( $prices[0] > 0 ) {
							$price = $formatter->formatCurrency($prices[0], 'USD');
							$out .= "<div style='font-size:.8em;border-top:2px solid #fff'>" . $price . " in " . $previous['title'] . "</div>";
						}
					}
				}

				return $out;
			}
		}
		return 'Coming soon';
	}

	function lll_phone() {
		global $post;
		$phone = get_site_option('phone_number');
		if ($post->post_type == 'neighborhood') {
			$neighborhood_phone = get_field('phone_number', $post->ID);
			if ($neighborhood_phone) {
				$phone = $neighborhood_phone;
			}
		}
		$plain_phone = preg_replace('/[^0-9]/', '', $phone);
		return "<a href='tel:{$plain_phone}'>{$phone}</a>";
	}

	function lll_neighborhood_map() {
		$maps = maps::getInstance();
		echo $maps->show_neighborhoods_map();
	}

	function get_url_data($url) {
		$url_data = [
			'type' => null,
			'name' => null
		];

		// strip out the base and host part of the site if it exists
		$url = str_replace( 'https://' . $_SERVER['HTTP_HOST'], '', $url );

		if ( $matches = explode( "/", trim( $url, "/" ) ) ) {
			$url_data['type'] = empty($matches[0])?null:$matches[0];
			$url_data['name'] = empty($matches[1])?null:$matches[1];
			if ($matches[0] == 'new-homes' && $matches[1] == 'communities') {
				$url_data['type'] = 'neighborhood';
				$url_data['name'] = empty($matches[2])?null:$matches[2];
			}
		}
		return $url_data;
	}

}

