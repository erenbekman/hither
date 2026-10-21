#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Area {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl Area {
    fn scaled(self, factor: f64) -> Area {
        Area { x: self.x * factor, y: self.y * factor, width: self.width * factor, height: self.height * factor }
    }
}

const GAP: f64 = 4.0;
const MARGIN: f64 = 8.0;
const MENU_BAR: f64 = 40.0;

fn fit(x: f64, screen: Area, width: f64) -> f64 {
    x.min(screen.x + screen.width - width - MARGIN).max(screen.x + MARGIN)
}

pub fn below_icon(icon: Area, screens: &[(Area, f64)], width: f64) -> Option<(f64, f64)> {
    screens.iter().find_map(|&(screen, scale)| {
        let icon = icon.scaled(1.0 / scale);
        let screen = screen.scaled(1.0 / scale);
        let center = icon.x + icon.width / 2.0;
        let inside = center >= screen.x && center < screen.x + screen.width && icon.y >= screen.y && icon.y < screen.y + screen.height;
        inside.then(|| (fit(center - width / 2.0, screen, width), icon.y + icon.height + GAP))
    })
}

pub fn top_right(screen: Area, scale: f64, width: f64) -> (f64, f64) {
    let screen = screen.scaled(1.0 / scale);
    (fit(screen.x + screen.width, screen, width), screen.y + MENU_BAR)
}

#[cfg(test)]
mod tests {
    use super::*;

    const RETINA: (Area, f64) = (Area { x: 0.0, y: 0.0, width: 3024.0, height: 1964.0 }, 2.0);
    const ABOVE: (Area, f64) = (Area { x: -164.0, y: -1080.0, width: 1920.0, height: 1080.0 }, 1.0);

    #[test]
    fn opens_under_the_icon_on_a_retina_screen_next_to_a_plain_one() {
        let icon = Area { x: 2074.0, y: 0.0, width: 36.0, height: 48.0 };
        assert_eq!(below_icon(icon, &[ABOVE, RETINA], 380.0), Some((856.0, 28.0)));
    }

    #[test]
    fn opens_under_the_icon_on_the_plain_screen_above() {
        let icon = Area { x: 1500.0, y: -1080.0, width: 22.0, height: 30.0 };
        assert_eq!(below_icon(icon, &[RETINA, ABOVE], 380.0), Some((1321.0, -1046.0)));
    }

    #[test]
    fn stays_on_screen_when_the_icon_sits_at_the_edge() {
        let icon = Area { x: 2990.0, y: 0.0, width: 30.0, height: 48.0 };
        assert_eq!(below_icon(icon, &[RETINA], 380.0), Some((1124.0, 28.0)));
        assert_eq!(top_right(RETINA.0, RETINA.1, 380.0), (1124.0, 40.0));
    }

    #[test]
    fn finds_no_place_for_an_icon_outside_every_screen() {
        let icon = Area { x: 9000.0, y: 0.0, width: 36.0, height: 48.0 };
        assert_eq!(below_icon(icon, &[RETINA, ABOVE], 380.0), None);
    }
}
