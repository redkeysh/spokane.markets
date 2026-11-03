/**
 * Weekend rail data for the admin shell. getWeekendRail returns a fixed fixture of the events as
 * they stood on 2026-11-03, whatever `now` is.
 */

export type RailStatus = "PUBLISHED" | "PENDING" | "DRAFT";

export type RailStall = {
  id: string;
  title: string;
  status: RailStatus;
  startLabel: string;
  kind: "event" | "submission";
};

export type RailWeek = {
  /** The Saturday as "2026-11-07", or "later". */
  key: string;
  /** "2026-11-07"; null for Later. */
  saturday: string | null;
  /** "Nov 7" or "Later". */
  label: string;
  /** "This Saturday", "Next Saturday", a local day name, "Jan to Oct 2027" for Later, or null. */
  name: string | null;
  live: number;
  pending: number;
  draft: number;
  /** Ordered Published, Pending, Draft. */
  stalls: RailStall[];
};

export type WeekendRail = {
  /** Today in America/Los_Angeles, "2026-11-03". */
  today: string;
  /** 0 = Monday .. 6 = Sunday. */
  todayWeekday: number;
  /** The next 7 Saturdays, then Later. */
  weeks: RailWeek[];
};

type Code = "P" | "W" | "D";
type FixtureWeek = [key: string, label: string, name: string | null, stalls: [string, string, Code, string][]];

const STATUS: Record<Code, RailStatus> = { P: "PUBLISHED", W: "PENDING", D: "DRAFT" };

export async function getWeekendRail(_now?: Date): Promise<WeekendRail> {
  return {
    today: "2026-11-03",
    todayWeekday: 1,
    weeks: FIXTURE.map(([key, label, name, rows]) => {
      const stalls: RailStall[] = rows.map(([id, title, code, startLabel]) => ({
        id,
        title,
        status: STATUS[code],
        startLabel,
        kind: "event",
      }));
      return {
        key,
        saturday: key === "later" ? null : key,
        label,
        name,
        live: stalls.filter((s) => s.status === "PUBLISHED").length,
        pending: stalls.filter((s) => s.status === "PENDING").length,
        draft: stalls.filter((s) => s.status === "DRAFT").length,
        stalls,
      };
    }),
  };
}

const FIXTURE: FixtureWeek[] = [
  ["2026-11-07", "Nov 7", "This Saturday", [
    ["cmvv9iv3w001u01mmeh5jr2kh", "Yuletide Holiday Marketplace", "P", "Fri 10 am"],
    ["cmw0avydn004401mmvwa61rvp", "Emerge Holiday Market", "W", "Sat 11 am"],
    ["cmw0avye4004801mm4y2ziq1t", "Spokane Potters' Guild SouperBowl Fundraiser", "W", "Sat 11 am"],
    ["cmvv9iv2d001k01mmfeltxwi5", "Fall Holistic Festival 2026", "W", "Sat 10 am"],
    ["cmvv9iv3j001s01mm2cgds04q", "Mistequa Casino Hotel Holiday Marketplace", "W", "Sat 10 am"],
    ["cmvv9iv4y002201mmkx4n39zb", "Spokane Farmers' Market", "W", "Sat 10 am"],
    ["cmw0avydr004501mmvrlluldx", "Fall Holistic Festival", "W", "Sat 10 am"],
    ["cmw0avye0004701mmdyfy6gap", "Hillyard Senior Center Craft Bazaar", "W", "Sat 10 am"],
    ["cmvv9iv2m001m01mm3h5lc0pi", "Post Falls Holiday Craft Fair", "W", "Sat 9 am"],
    ["cmw0avydh004301mmpeii1gqd", "Holiday Craft Fair (Post Falls Parks & Recreation)", "W", "Sat 9 am"],
    ["cmw0avydw004601mmd6swb4nb", "Holiday Bazaar (Cheney United Methodist Church)", "W", "Sat 9 am"],
    ["cmvv9iv33001p01mmeooskwyq", "11th Annual Rebel Junk Holiday Market", "W", "Fri 6 pm"],
    ["cmw0avyd4004201mmpuy67drf", "Rebel Junk Holiday Market", "W", "Fri 5:30 pm"],
    ["cmvv9iv6t002h01mmhhl0mc6j", "Hillyard Senior Center Holiday Craft Bazaar", "D", "Sat 10 am"],
    ["cmvv9iv71002j01mm7xmm1gkx", "Craft and Bake Sale at Pilgrim Lutheran Church", "D", "Sat 10 am"],
    ["cmvv9iv89002q01mmqfci60ar", "Handmade Holiday Craft Fair", "D", "Sat 10 am"],
    ["cmw0avyea004901mm7u6fnjf2", "CardCon", "D", "Sat 10 am"],
    ["cmvv9iv6g002f01mmwetenxg5", "Holiday Bazaar in Cheney", "D", "Sat 9 am"],
    ["cmvv9iv6n002g01mmt20iyyz8", "Annual St. Gregorios Christian Bazaar", "D", "Sat 9 am"],
    ["cmvv9iv6x002i01mmate75i9t", "Whitworth Auxiliary 2026 Fall Bazaar", "D", "Sat 9 am"],
    ["cmvv9iv7f002m01mm8ctuawo5", "Central Valley High School Fall Craft Fair", "D", "Sat 9 am"],
    ["cmw0avyef004a01mmdyd9zheg", "Holiday Bazaar (Trinity Lutheran Church)", "D", "Sat 8 am"],
  ]],
  ["2026-11-14", "Nov 14", "Next Saturday", [
    ["cmnikxwu9001p01mh23t36zfw", "Shadle Park Boosters Fall Craft Show 2026", "P", "Sat 9 am"],
    ["cmnikxxnu001v01mhbz7fbvjh", "Mead Craft Fair", "P", "Sat 9 am"],
    ["cmw0avyfe004i01mmugcfok4z", "Fall Folk Festival", "W", "Sat 11 am"],
    ["cmvv9iv2i001l01mmcuw70ze4", "The Fall First Look Bridal Show", "W", "Sat 10 am"],
    ["cmvv9iv52002301mmngoisrbh", "Spokane Farmers' Market", "W", "Sat 10 am"],
    ["cmw0avyf7004h01mmav65alez", "Cabin Fever Market (Kootenai County Farmers' Market)", "W", "Sat 10 am"],
    ["cmw0avyfr004l01mml3grq3r3", "Fall First Look Bridal Show", "W", "Sat 10 am"],
    ["cmw0avyg3004n01mm1namqgnd", "Community Market at Silver Lake", "W", "Sat 10 am"],
    ["cmw0avyfk004j01mmokyf5l4b", "Snow & ATV Show (Spokane Winter Knights)", "W", "Sat 9 am"],
    ["cmw0avyfu004m01mmvqpvtvw7", "Snowflake Faire (St. Luke's Episcopal Church)", "W", "Sat 9 am"],
    ["cmvv9iv79002l01mmqe04wuyc", "The Spokane Jeweler's Guild Show", "D", "Sat 12 pm"],
    ["cmvv9iv68002e01mmixgjumjd", "Elk Soup's Native Arts Market", "D", "Sat 10 am"],
    ["cmw0avyh4004r01mmhqrr066c", "Brookdale Coeur d'Alene Winter Craft Fair", "D", "Sat 10 am"],
    ["cmw0avyhh004s01mm8tnxym13", "Holiday Market (Spirit Lake Community Center)", "D", "Sat 10 am"],
    ["cmvv9iv7m002n01mmjvkr82rn", "Autumn Indoor Market", "D", "Sat 12 am"],
    ["cmw0avyhy004t01mme28vgow6", "Winter Bazaar (Blanchard Community Center)", "D", "Fri 12 pm"],
  ]],
  ["2026-11-21", "Nov 21", null, [
    ["cmndzqad2000901noiaqiabk7", "Custer's Christmas Arts & Crafts Show", "P", "Fri 10 am"],
    ["cmvv9iv4p002001mmxv4ft0hy", "Newport Farmers Market Holiday Market", "W", "Sat 10 am"],
    ["cmvv9iv56002401mmp3v140mj", "Spokane Farmers' Market", "W", "Sat 10 am"],
    ["cmvv9iv3e001r01mmim42zukd", "Coeur d'Alene Ski Swap", "W", "Sat 9 am"],
    ["cmvv9iv8g002r01mmxbcrmfqs", "Santa Helpers For Seniors Craft Fair", "D", "Sat 10 am"],
    ["cmw0avyjr004v01mm94q0ljm2", "Lake City Center Fall Arts & Craft Fair", "D", "Sat 10 am"],
    ["cmw0avyik004u01mmj78cmaxh", "Bestland Senior Living Annual Bazaar & Craft Fair", "D", "Fri 10 am"],
  ]],
  ["2026-11-28", "Nov 28", "Small Business Saturday", [
    ["cmw0avyl2005101mm5tknsfof", "Kendall Yards Christmas Market", "W", "Sun 12 pm"],
    ["cmw0avyky005001mm1d94dicd", "Kendall Yards Christmas Market", "W", "Sat 12 pm"],
    ["cmvv9iv47001w01mm5lut2h2a", "33 Artists Market", "W", "Sat 11 am"],
    ["cmw0avykl004y01mmwf14dky1", "33 Artists Market: Small Business Saturday", "W", "Sat 11 am"],
    ["cmvv9iv3r001t01mmcd96ngzl", "Winter Market at The Quarry", "W", "Sat 8 am"],
    ["cmw0avyku004z01mmxhbc2auj", "Kendall Yards Christmas Market", "W", "Fri 12 pm"],
    ["cmw0avylj005501mmdipasdjl", "A Very Merry Market", "W", "Fri 9 am"],
    ["cmw0avymd005901mm2robu6xi", "German Christmas Market (Post Falls Public Market)", "D", "Fri 10 am"],
  ]],
  ["2026-12-05", "Dec 5", null, [
    ["cmnikinsh000f01mhgti62ath", "Ridgeline Craft & Vendor Fair", "P", "Sat 9 am"],
    ["cmonsbsa5000z01te4zr67fy3", "Rogers High School Holiday Craft Fair", "P", "Sat 9 am"],
    ["cmvv9iv4b001x01mm4lwg8l7f", "Cheney Blackhawk Boosters Craft Fair", "W", "Sat 10 am"],
    ["cmvv9iv4g001y01mm66mprb1t", "Chewelah Farmers Market Christmas Faire", "W", "Sat 10 am"],
    ["cmw0avyn3005g01mmaeaoa5yu", "Cheney Blackhawk Booster Club Craft Fair", "W", "Sat 10 am"],
    ["cmvv9iv2r001n01mmgxqpfkj8", "Post Falls Winterfest & Plaza Market", "W", "Fri 4 pm"],
    ["cmvv9iv4l001z01mmf7onaexx", "Millwood Farmers Market Holiday Market", "W", "Fri 4 pm"],
    ["cmw0avym1005601mm9y0m9cex", "A Very Merry Market", "W", "Fri 10 am"],
    ["cmvv9iv8m002s01mmtsal7iqp", "Holiday Craft Fair", "D", "Sat 10 am"],
    ["cmw0avymz005f01mmb9l3pjcr", "Athol Christmas Market", "D", "Sat 10 am"],
    ["cmvv9iv75002k01mmnvg1n12e", "The General Store Trading Card Show", "D", "Sat 9 am"],
    ["cmw0avymg005a01mms7hj80oe", "German Christmas Market (Post Falls Public Market)", "D", "Fri 10 am"],
    ["cmw0avymw005e01mmj1errpzb", "Celebrate the Season (Community Presbyterian Church, Post Falls)", "D", "Fri 9 am"],
  ]],
  ["2026-12-12", "Dec 12", null, [
    ["cmw0avylg005401mmvlb1kb57", "Kendall Yards Christmas Market", "W", "Sun 12 pm"],
    ["cmw0avylb005301mm8b340daa", "Kendall Yards Christmas Market", "W", "Sat 12 pm"],
    ["cmvv9iv23001j01mmk9l75p7l", "Spokane Valley Winter Market 2026", "W", "Sat 10 am"],
    ["cmvv9iv2x001o01mm34oajjjg", "North Idaho's Cowboy Christmas", "W", "Sat 10 am"],
    ["cmw0avyng005j01mm6vrttzsv", "Spokane Valley Winter Market", "W", "Sat 10 am"],
    ["cmw0avynm005k01mmlgqy6ey3", "Terrain BRRRZAAR", "W", "Sat 10 am"],
    ["cmw0avyl7005201mmayq7snvp", "Kendall Yards Christmas Market", "W", "Fri 12 pm"],
    ["cmw0avym5005701mm7lm2fqk7", "A Very Merry Market", "W", "Fri 10 am"],
    ["cmw0avynt005l01mm1e9ohsa6", "Winter Market (Kootenai County Farmers' Market)", "D", "Sat 12 am"],
    ["cmw0avyml005b01mmixj80nl0", "German Christmas Market (Post Falls Public Market)", "D", "Fri 10 am"],
    ["cmvv9iv62002d01mmyadcot5j", "Holiday Village", "D", "Thu 5 pm"],
  ]],
  ["2026-12-19", "Dec 19", "Saturday before Christmas", [
    ["cmvv9iv39001q01mmhp7zgpm0", "Gather & Grow Holiday Market", "W", "Sat 10 am"],
    ["cmw0avym9005801mmrlhl6jp9", "A Very Merry Market", "W", "Fri 10 am"],
    ["cmvv9iv8w002t01mmi4gh1xah", "Last Minute Shopping Craft Fair", "D", "Sat 10 am"],
    ["cmw0avymo005c01mmx3bhdl6s", "German Christmas Market (Post Falls Public Market)", "D", "Fri 10 am"],
  ]],
  ["later", "Later", "Jan to Oct 2027", [
    ["cmvv9iv5w002c01mmr4teas9y", "Family Fall Festival 2027", "W", "Sat Oct 16, 2027"],
    ["cmw0clzv3000101tekstaaon1", "10th Annual Jacked Up Big Show \"BIG GIVE\"", "W", "Sat Jul 17, 2027"],
    ["cmw0avyox005u01mm8yso2wxd", "North Idaho Eat's and Beats", "W", "Fri Jun 4, 2027"],
    ["cmw0avygy004q01mm1gwjmrvx", "Community Market at Silver Lake", "W", "Sat Mar 13, 2027"],
    ["cmvv9iv59002501mmrc3o46a4", "Spokane Home & Yard Show", "W", "Thu Feb 25, 2027"],
    ["cmw0avyoo005s01mmldsilb1c", "Custer's Spokane Home & Yard Show", "W", "Thu Feb 25, 2027"],
    ["cmvv9iv5o002a01mmf58o4l68", "Spokane Golf & Travel Show with the Great Outdoors & Bike Expo", "W", "Sat Feb 20, 2027"],
    ["cmw0avyok005r01mmsad2ot8w", "Spokane Golf & Travel Show", "W", "Sat Feb 20, 2027"],
    ["cmw0avygt004p01mmkjjtgu0r", "Community Market at Silver Lake", "W", "Sat Feb 13, 2027"],
    ["cmvv9iv5g002701mmevlj9q7t", "Ag Expo 2027", "W", "Tue Feb 2, 2027"],
    ["cmvv9iv5l002901mmtqmieyk0", "Spokane Boat Show", "W", "Thu Jan 28, 2027"],
    ["cmw0avyoh005q01mmbsy08fio", "Nspire Wedding Show", "W", "Sun Jan 24, 2027"],
    ["cmvv9iv5d002601mm1b395k54", "Inland Northwest RV Show & Sale", "W", "Thu Jan 21, 2027"],
    ["cmvv9iv5r002b01mmw8iewvi8", "Post Falls Bridal Tour & Special Event Fair", "W", "Sat Jan 16, 2027"],
    ["cmvv9iv5i002801mmvplnu2gf", "The Bridal Festival", "W", "Sat Jan 9, 2027"],
    ["cmw0avygk004o01mmp3rm8b8x", "Community Market at Silver Lake", "W", "Sat Jan 9, 2027"],
    ["cmw0avyo3005n01mm40kap8yp", "Northwest's Premier Bridal Festival", "W", "Sat Jan 9, 2027"],
    ["cmw0avyor005t01mmnlp9zvib", "Spokane Expo 2027", "D", "Sat Apr 17, 2027"],
    ["cmvv9iv93002u01mm1l963czp", "Rebel Junk Spring Vintage Market", "D", "Fri Mar 26, 2027"],
    ["cmvv9iv81002p01mmvzmywuo0", "Cabin Fever Indoor Market", "D", "Sat Feb 27, 2027"],
    ["cmvv9iv7r002o01mmmzk7hbue", "Cabin Fever Indoor Market", "D", "Sat Jan 30, 2027"],
  ]],
];
