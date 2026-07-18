// All photographic images are real, freely-licensed photographs of Lake Kariba,
// sourced from Wikimedia Commons (CC BY-SA / CC0). Wikimedia does not host any
// free-licensed photos of actual houseboats or cruise boats operating on Kariba,
// so those listings use a labelled illustration instead of a real photo that
// would misrepresent the vessel (see BoatImage.tsx). Fishing boats do have
// genuine matching photos, since Lake Kariba's small-boat fishing fleet is well
// documented on Commons, and those are used directly.
const wiki = (path: string) => `https://upload.wikimedia.org/wikipedia/commons/${path}`;

export const photos = {
  lake1: wiki('thumb/4/47/Kariba%2C_Zimbabwe_01.JPG/1280px-Kariba%2C_Zimbabwe_01.JPG'),
  lake2: wiki('thumb/3/32/Kariba%2C_Zimbabwe_02.JPG/1280px-Kariba%2C_Zimbabwe_02.JPG'),
  lake3: wiki('thumb/d/df/Kariba%2C_Zimbabwe_03.JPG/1280px-Kariba%2C_Zimbabwe_03.JPG'),
  resort1: wiki('thumb/6/66/Kariba%2C_Zimbabwe_04.JPG/1280px-Kariba%2C_Zimbabwe_04.JPG'),
  resort2: wiki('thumb/1/17/Kariba%2C_Zimbabwe_05.JPG/1280px-Kariba%2C_Zimbabwe_05.JPG'),
  resort3: wiki('thumb/b/bd/Kariba%2C_Zimbabwe_08.JPG/1280px-Kariba%2C_Zimbabwe_08.JPG'),
  sunset1: wiki('f/f1/Sunset_over_Kariba_Dam.jpg'),
  sunset2: wiki('2/28/Zimbabwe_Sunset_%2825456051%29.jpg'),
  sunset3: wiki('thumb/e/ed/Zimbabwe_Sunset_%288597185%29.jpg/1280px-Zimbabwe_Sunset_%288597185%29.jpg'),
  sunset4: wiki('thumb/6/6f/Kariba%2C_Zimbabwe_13.JPG/1280px-Kariba%2C_Zimbabwe_13.JPG'),
  sunset5: wiki('thumb/a/a2/Kariba%2C_Zimbabwe_14.JPG/1280px-Kariba%2C_Zimbabwe_14.JPG'),
  wildlife1: wiki(
    'thumb/c/cd/View_of_the_surrounding_at_the_Lake_Kariba_with_hippos_%286910358407%29.jpg/1280px-View_of_the_surrounding_at_the_Lake_Kariba_with_hippos_%286910358407%29.jpg',
  ),
  // Real boats, clearly visible and prominent in frame:
  kapentaRig: wiki('thumb/2/2e/Kariba_Kapenta_Rig.JPG/1280px-Kariba_Kapenta_Rig.JPG'),
  fishermen: wiki('f/fd/Fishermen_at_work_on_the_lake_Kariba.jpg'),
  fishingBoat: wiki(
    'thumb/d/d5/Fishermen_in_a_fishing_boat_kariba_lake_beach_Siavonga_Zambia.jpg/1280px-Fishermen_in_a_fishing_boat_kariba_lake_beach_Siavonga_Zambia.jpg',
  ),
  canoe: wiki(
    'thumb/0/03/Fishermen_in_a_canoe_boat_kariba_lake_Siavonga_Zambia.jpg/1280px-Fishermen_in_a_canoe_boat_kariba_lake_Siavonga_Zambia.jpg',
  ),
  harbour: wiki(
    'thumb/1/16/Boats_Harbor%2C_Kairba_Lake%2C_Siavonga_Zambia.jpg/1280px-Boats_Harbor%2C_Kairba_Lake%2C_Siavonga_Zambia.jpg',
  ),
};

export const heroImage = photos.sunset1;

// Sentinel values recognised by BoatImage: for listings with no matching real
// photo, this renders a labelled illustration instead of a real photo that
// would misrepresent the vessel. Fishing boats here do have real matching
// photos (see kapentaRig, fishingBoat, canoe, fishermen above), but the
// fishing illustration is kept available for any future listing that doesn't.
export const illustration = {
  houseboat: 'illustration:houseboat',
  cruiser: 'illustration:cruiser',
  fishing: 'illustration:fishing',
} as const;
