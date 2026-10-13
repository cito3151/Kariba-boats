// Decorative and marketing photography only: the hero, the boat-type tiles, the
// landing page's departures and closing bands, the portal page headers and the
// sign-in backdrop. Real boat listings never take a
// stock photo; a listing with no photo of its own shows a labelled illustration
// instead (see `illustration` below and BoatImage.tsx).
//
// Every photo below was downloaded and checked by eye: a boat is the subject, of
// the type its slot names, with no watermark or burned-in date stamp. Each is
// hotlinked from its licensed CDN, which resizes on request, so nothing binary is
// committed and a phone downloads a phone-sized file through `srcSet`.
//
// Licences: Unsplash License (https://unsplash.com/license) and Pexels License
// (https://www.pexels.com/license/). Both allow commercial use with no
// attribution required; credits are kept here anyway. None is an Unsplash+ photo.
//
// The Wikimedia Commons photos of Lake Kariba this replaced were mostly scenery
// with no boat in frame (a sunset, a floodplain with hippos), the "Kariba,
// Zimbabwe NN.JPG" set carries a burned-in camera date stamp, and the one hero
// photo with a boat in it was a 1080px original that softened on wide screens.

type Source = (width: number) => string;

// q=80 suits photos seen clearly; the portal headers sit under a navy scrim of
// at least 75%, where q=60 is indistinguishable and saves a third of the bytes.
const unsplash = (id: string, quality = 80): Source => (width) =>
  `https://images.unsplash.com/photo-${id}?w=${width}&q=${quality}&auto=format&fit=crop`;
const pexels = (id: number): Source => (width) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${width}`;

/** Widths for photos that span the viewport: hero, portal headers, sign-in backdrop. */
const FULL_BLEED = [640, 1080, 1600, 2400];
/** Widths for tiles and cards, which are at most two thirds of a phone screen. */
const TILE = [400, 600, 900, 1200];

export interface Photo {
  src: string;
  srcSet: string;
  /**
   * Tailwind object-position for this photo in its slot, chosen so the boat stays
   * in frame from a 375px phone to a 1440px screen. A literal class string, so
   * Tailwind's scanner sees it.
   */
  position: string;
  /**
   * Show the photo mirrored left to right (PhotoBackdrop only). For a header band
   * whose type sits on the left: from about 1024px the band is so wide that the
   * whole width of the photo shows, so `position` cannot move a boat out from
   * behind the title, and mirroring is the only way to put it on the right, where
   * the scrim is lightest. Only used where no lettering can be read in frame.
   */
  mirror?: boolean;
}

function photo(source: Source, widths: number[], position: string, mirror = false): Photo {
  return {
    src: source(widths[widths.length - 1]),
    srcSet: widths.map((w) => `${source(w)} ${w}w`).join(', '),
    position,
    ...(mirror && { mirror }),
  };
}

export const photos = {
  // Three houseboats moored on Langebaan Lagoon, South Africa; the same scene as
  // a landscape (hero from 640px up) and a portrait (hero on phones). Magda Ehlers, Pexels License, 5472x3648 and 3648x5472.
  // https://www.pexels.com/photo/the-kraalbaai-lifestyle-houseboats-in-sout-africa-5349466/
  // https://www.pexels.com/photo/floating-houses-in-the-lake-5349465/
  houseboatsLandscape: photo(pexels(5349466), FULL_BLEED, 'object-[52%_50%]'),
  houseboatsPortrait: photo(pexels(5349465), FULL_BLEED, 'object-center'),

  // --- Boat-type tiles (4:5) ---
  // A modern two-deck houseboat on pontoons, moored in a marina. Robert So,
  // Pexels License, 4000x4471.
  // https://www.pexels.com/photo/boats-in-a-harbor-19750417/
  houseboat: photo(pexels(19750417), TILE, 'object-[60%_40%]'),
  // A bowrider speedboat with guests aboard on a wooded lake. Adrian Hernandez,
  // Unsplash License, 2213x3319.
  // https://unsplash.com/photos/a-group-of-people-on-a-boat-in-the-water-ULI7P_p9IL4
  speedboat: photo(unsplash('1635958063719-8288e9639f50'), TILE, 'object-[50%_40%]'),
  // Two anglers in a sport-fishing boat with rods out, on a calm lake. Efrem Efre,
  // Pexels License, 6960x4640.
  // https://www.pexels.com/photo/anglers-on-boat-15780477/
  fishing: photo(pexels(15780477), TILE, 'object-center'),
  // A white motor cruiser under way on a lake. Dmitrii E., Unsplash License,
  // 5112x3513.
  // https://unsplash.com/photos/a-white-boat-traveling-across-a-large-body-of-water-JRdkiW58VWY
  cruiser: photo(unsplash('1727379899259-81ec81876551'), TILE, 'object-[40%_50%]'),
  // A canopied pontoon boat full of guests on a lake. Joshua J. Cotten, Unsplash
  // License, 3500x2333.
  // https://unsplash.com/photos/a-boat-with-people-on-it-in-the-water-MD1GGdoE9KU
  pontoon: photo(unsplash('1634586636411-99fc93573de8'), TILE, 'object-[8%_50%]'),

  // --- Portal page headers (behind a navy scrim; see PortalHeader) ---
  // The title sits on the left of the band, under the densest part of the scrim,
  // so the boat belongs on the right. Three of these are mirrored to put it there
  // (see `mirror`); the launch already fills the centre and right. `position`
  // refers to the unmirrored photo and matters at phone and tablet widths, where
  // the band is narrow enough to crop the photo's sides.
  // Motor yachts moored on a river at golden hour. Ruslan Ruslan, Unsplash
  // License, 4930x3944.
  // https://unsplash.com/photos/motor-yachts-on-river-at-golden-hour-zO4h0uwFf7c
  mooredYachts: photo(unsplash('1788266127031-ce0d40891221', 60), FULL_BLEED, 'object-[40%_60%]', true),
  // A two-deck safari boat on a wide African river, elephants crossing beside it.
  // Sikwe Scarter, Unsplash License, 6000x4000.
  // https://unsplash.com/photos/tour-boat-on-river-with-elephants-in-background-mD8m_TdQhmM
  safariBoat: photo(unsplash('1764390692517-98db135fe1be', 60), FULL_BLEED, 'object-[30%_50%]', true),
  // Guests aboard a canopied launch on the Zambezi in late light. Omoniyi David,
  // Unsplash License, 6000x4000.
  // https://unsplash.com/photos/a-group-of-people-riding-on-the-back-of-a-boat-2cOyWsUhcfA
  riverLaunch: photo(unsplash('1721418581886-d10b61214356', 60), FULL_BLEED, 'object-[65%_50%]'),
  // A canopied cruise boat at anchor at sunset, hills on the far shore; Tanzania.
  // Japhet Kweba, Pexels License, 4574x2294.
  // https://www.pexels.com/photo/serene-sunset-over-zanzibar-waters-30773536/
  sunsetCruise: photo(pexels(30773536), FULL_BLEED, 'object-[15%_70%]', true),

  // --- Landing bands and the sign-in page ---
  // A green-canopied houseboat pulled up on the sandy shore of Lake Kariba at
  // Siavonga, Zambia: the real lake. Behind the "Where trips depart" band, under a
  // navy scrim of at least 75%, where the name painted on its bow cannot be read,
  // so it does not stand for any one operator. Chibili Mugala, Pexels License,
  // 6000x3300.
  // https://www.pexels.com/photo/view-of-a-boat-moored-on-the-lakeshore-in-siavonga-zambia-20896209/
  karibaShore: photo(pexels(20896209), FULL_BLEED, 'object-[60%_55%]'),
  // Two anglers in a canopied fishing boat at sunset on a calm lake, the sun on
  // the water behind them. The image card in the closing band. Hiếu Lê, Pexels
  // License, 2181x2133.
  // https://www.pexels.com/photo/serene-sunset-boat-ride-on-tranquil-lake-34386897/
  sunsetAnglers: photo(pexels(34386897), TILE, 'object-bottom'),
  // A houseboat at anchor below a red-earth shore on a drawn-down reservoir,
  // Lake Shasta, California, which reads much like Kariba's own shoreline. The
  // sign-in backdrop. The houseboat sits right of centre (68-80% across), and the
  // card covers the middle of the screen. On a portrait tablet the frame is a
  // narrow slice, so it is anchored right to keep the boat in it; from 1024px the
  // whole width nearly fits, and anchoring at 50% puts the boat clear of the card
  // (about 760-925px at 1024, 1010-1205px at 1440). Bruce Warrington, Unsplash
  // License, 4896x3264.
  // https://unsplash.com/photos/brown-power-boat-on-calm-body-of-water-C6pWrVPbRO8
  shoreHouseboat: photo(unsplash('1548342653-a614c828e272'), FULL_BLEED, 'object-[72%_60%] lg:object-[50%_60%]'),
};

/**
 * The soft lake wash behind pale page areas (LakeBackdrop): the white cruiser on
 * blue water from the boat-type tiles, blurred, brightened, flattened and
 * desaturated by the CDN itself (imgix's blur, bri, con and sat), so the browser
 * draws a plain image and scrolling never re-runs a CSS blur. Under that blur no
 * detail survives past 480px, so a larger file would only cost bytes (about
 * 14KB). Measured, its darkest pixel is rgb(155 162 162): LakeBackdrop's
 * contrast figures are worked from that.
 */
export const lakeWashSrc =
  `${unsplash('1727379899259-81ec81876551', 60)(480)}&blur=80&bri=35&con=-40&sat=-20`;

/** The backdrop behind the sign-in, sign-up and password pages (AuthCard). */
export const authPhoto = photos.shoreHouseboat;

/**
 * The landing hero, art-directed: the portrait frame on phones keeps all three
 * houseboats below the headline, where the landscape frame would put the rear
 * one behind the subtitle.
 */
export const heroPhoto = {
  landscape: photos.houseboatsLandscape,
  portrait: photos.houseboatsPortrait,
};

/** Which photo sits behind each portal's page header. */
export const portalPhotos = {
  owner: photos.mooredYachts,
  admin: photos.safariBoat,
  partner: photos.riverLaunch,
  trips: photos.sunsetCruise,
} satisfies Record<string, Photo>;

// Sentinel values recognised by BoatImage: a listing with no photo of its own
// renders a labelled illustration of its type, never a stock photo that would
// misrepresent the vessel.
export const illustration = {
  houseboat: 'illustration:houseboat',
  cruiser: 'illustration:cruiser',
  fishing: 'illustration:fishing',
} as const;
