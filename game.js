// @ts-nocheck
import * as THREE from "./vendor/three.module.min.js";
import * as BufferGeometryUtils from "./vendor/BufferGeometryUtils.js";
import { buildExtraDressing } from "./props.js";

const PLAYER_R = 0.42;
const INTERACT = 2.9;

/* the contract week — each day is its own shift with its own mechanics */
let day = 1;
let shiftLen = 600;
const SHIFT = 600; // day-1 length; use shiftLen everywhere runtime
const WEEK1_MONDAY = Date.UTC(2026, 7, 17); // Mon Aug 17, 2026 — week 1 of the book
function currentContractWeek() {
  const w = Math.floor((Date.now() - WEEK1_MONDAY) / 604800000) + 1;
  return Math.max(1, Math.min(12, w));
}
function weekOfDay(d) {
  return Math.max(1, Math.ceil((Number(d) || 1) / 7));
}
function cycleDay(d) {
  return ((((Number(d) || 1) - 1) % 7) + 7) % 7 + 1;
}
function weekRangeLabel(w) {
  const startMs = WEEK1_MONDAY + (Math.max(1, w) - 1) * 604800000;
  const fmt = (ms) =>
    new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return fmt(startMs) + "–" + fmt(startMs + 6 * 86400000);
}
const LAST_DAY = Math.max(14, currentContractWeek() * 7);

function dayInfo(d) {
  return DAYS[d] || DAYS[cycleDay(d)] || DAYS[1];
}
function jobsForDay(d) {
  const list = dayInfo(d).jobs;
  return isTremont() ? list.filter((j) => !j.utahOnly) : list.slice();
}

function setDay(d) {
  day = d;
  JOBS = jobsForDay(d);
  shiftLen = dayInfo(d).shift;
}

function unlockedDays() {
  try {
    let u = Number(localStorage.getItem("lw_unlocked") || 1);
    // Any finished day on this box unlocks the next one
    for (let d = 1; d <= LAST_DAY; d++) {
      for (const who of ["utah", "tremont"]) {
        const b = loadBest(d, who);
        if (b && (Number(b.watts) || 0) > 0) u = Math.max(u, Math.min(LAST_DAY, d + 1));
      }
    }
    if (u < 2 && anyBest()) u = 2; // pre-picker players
    // Persist so the gate doesn't forget between boots
    if (u > 1) {
      try {
        const stored = Number(localStorage.getItem("lw_unlocked") || 1);
        if (u > stored) localStorage.setItem("lw_unlocked", String(u));
      } catch (_) {}
    }
    return Math.min(LAST_DAY, Math.max(1, u));
  } catch (_) {
    return LAST_DAY; // storage blocked: let them play everything
  }
}

function unlockDay(d) {
  try {
    if (d > unlockedDays()) localStorage.setItem("lw_unlocked", String(Math.min(LAST_DAY, d)));
  } catch (_) {}
}

/* deterministic per-run randomness (survives checkpoint resume) */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COLORS = {
  hat: 0xf4f1ea,
  skin: 0xc6865a,
  hair: 0x3a2a22,
  beard: 0x4a3428,
  shirt: 0xc62828,
  vest: 0xc6e03c,
  stripe: 0xd8dce0,
  orange: 0xff6a1a,
  jeans: 0x3b5678,
  boot: 0x4a3424,
  steel: 0x6d7278,
  beam: 0x3a3d42,
};

const DAY1_JOBS = [
  { id: "tools", name: "Grab pouch", icon: "icon_tools.jpg", need: 1 },
  { id: "conduit", name: "Run red conduit", icon: "icon_conduit.jpg", need: 6, fa: true },
  { id: "boxes", name: "Mount FA boxes", icon: "icon_box.jpg", need: 4, fa: true },
  { id: "smokes", name: "Hang smokes", icon: "icon_smoke.jpg", need: 5, fa: true },
  { id: "nac", name: "Strobes & pulls", icon: "icon_strobe.jpg", need: 5, fa: true },
  { id: "vesda", name: "Land VESDAs", icon: "icon_facp.jpg", need: 2, fa: true, utahOnly: true },
  { id: "high", name: "High smokes · scissor", icon: "icon_smoke.jpg", need: 1, fa: true },
  { id: "facp", name: "Commission FACP", icon: "icon_facp.jpg", need: 1, fa: true },
];
const DAY2_JOBS = [
  { id: "tools", name: "Grab meter bag", icon: "icon_tools.jpg", need: 1 },
  { id: "magtest", name: "Mag-test smokes", icon: "icon_smoke.jpg", need: 4, fa: true },
  { id: "troubles", name: "Chase troubles", icon: "icon_box.jpg", need: 3, fa: true },
  { id: "eol", name: "Swap EOL resistors", icon: "icon_strobe.jpg", need: 1, fa: true },
  { id: "high", name: "High smokes · scissor", icon: "icon_smoke.jpg", need: 1, fa: true },
  { id: "facp", name: "Walk-test FACP", icon: "icon_facp.jpg", need: 1, fa: true },
];
const DAY3_JOBS = [
  { id: "tools", name: "Grab the walk sheet", icon: "icon_tools.jpg", need: 1 },
  { id: "demos", name: "Demo devices for AHJ", icon: "icon_strobe.jpg", need: 4, fa: true },
  { id: "facp", name: "Final acceptance", icon: "icon_facp.jpg", need: 1, fa: true },
];
const DAY4_JOBS = [
  { id: "tools", name: "Grab the lamp", icon: "icon_tools.jpg", need: 1 },
  { id: "batteries", name: "Test battery strobes", icon: "icon_strobe.jpg", need: 4, fa: true },
  { id: "ducts", name: "Reset duct detectors", icon: "icon_smoke.jpg", need: 2, fa: true },
  { id: "high", name: "High ducts · scissor", icon: "icon_smoke.jpg", need: 1, fa: true },
  { id: "facp", name: "Transfer to normal power", icon: "icon_facp.jpg", need: 1, fa: true },
];
const DAY5_JOBS = [
  { id: "tools", name: "Grab the tugger rope", icon: "icon_tools.jpg", need: 1 },
  { id: "reels", name: "Stage wire reels", icon: "icon_box.jpg", need: 3, fa: true },
  { id: "pulls", name: "Pull the riser", icon: "icon_conduit.jpg", need: 3, fa: true },
  { id: "term", name: "Land the riser", icon: "icon_facp.jpg", need: 1, fa: true },
];
const DAY6_JOBS = [
  { id: "tools", name: "Grab the punch list", icon: "icon_tools.jpg", need: 1 },
  { id: "punch", name: "Clear punch items", icon: "icon_box.jpg", need: 5, fa: true },
  { id: "high", name: "High punch · scissor", icon: "icon_smoke.jpg", need: 1, fa: true },
  { id: "sign", name: "Get Drew's sign-off", icon: "icon_facp.jpg", need: 1, fa: true },
];
const DAY7_JOBS = [
  { id: "tools", name: "Grab your good pen", icon: "icon_tools.jpg", need: 1 },
  { id: "checks", name: "Final device checks", icon: "icon_smoke.jpg", need: 4, fa: true },
  { id: "signoffs", name: "Collect sign-offs", icon: "icon_box.jpg", need: 3, fa: true },
  { id: "facp", name: "ENERGIZE", icon: "icon_facp.jpg", need: 1, fa: true },
];
const DAY8_JOBS = [
  { id: "tools", name: "Grab pouch", icon: "icon_tools.jpg", need: 1 },
  { id: "conduit", name: "Extend the loop", icon: "icon_conduit.jpg", need: 4, fa: true },
  { id: "boxes", name: "Mount isolators", icon: "icon_box.jpg", need: 3, fa: true },
  { id: "magtest", name: "Verify last week's loop", icon: "icon_smoke.jpg", need: 3, fa: true },
  { id: "vesda", name: "Land aux expander", icon: "icon_facp.jpg", need: 1, fa: true, utahOnly: true },
  { id: "facp", name: "Add the loop card", icon: "icon_facp.jpg", need: 1, fa: true },
];
const DAY9_JOBS = [
  { id: "tools", name: "Grab meter bag", icon: "icon_tools.jpg", need: 1 },
  { id: "magtest", name: "Retest every smoke", icon: "icon_smoke.jpg", need: 6, fa: true },
  { id: "troubles", name: "Chase leftover troubles", icon: "icon_box.jpg", need: 2, fa: true },
  { id: "high", name: "High retest · scissor", icon: "icon_smoke.jpg", need: 1, fa: true },
  { id: "facp", name: "Walk-test FACP", icon: "icon_facp.jpg", need: 1, fa: true },
];
const DAY10_JOBS = [
  { id: "tools", name: "Grab the walk sheet", icon: "icon_tools.jpg", need: 1 },
  { id: "demos", name: "Demo for the return walk", icon: "icon_strobe.jpg", need: 6, fa: true },
  { id: "facp", name: "Final acceptance", icon: "icon_facp.jpg", need: 1, fa: true },
];
const DAY11_JOBS = [
  { id: "tools", name: "Grab the lamp", icon: "icon_tools.jpg", need: 1 },
  { id: "batteries", name: "Test battery strobes", icon: "icon_strobe.jpg", need: 4, fa: true },
  { id: "ducts", name: "Reset duct detectors", icon: "icon_smoke.jpg", need: 3, fa: true },
  { id: "high", name: "High ducts · scissor", icon: "icon_smoke.jpg", need: 1, fa: true },
  { id: "facp", name: "Transfer to normal power", icon: "icon_facp.jpg", need: 1, fa: true },
];
const DAY12_JOBS = [
  { id: "tools", name: "Grab the tugger rope", icon: "icon_tools.jpg", need: 1 },
  { id: "reels", name: "Stage feeder-two reels", icon: "icon_box.jpg", need: 4, fa: true },
  { id: "pulls", name: "Pull feeder two", icon: "icon_conduit.jpg", need: 4, fa: true },
  { id: "term", name: "Land feeder two", icon: "icon_facp.jpg", need: 1, fa: true },
];
const DAY13_JOBS = [
  { id: "tools", name: "Grab the punch list", icon: "icon_tools.jpg", need: 1 },
  { id: "punch", name: "Clear callbacks", icon: "icon_box.jpg", need: 7, fa: true },
  { id: "high", name: "High callback · scissor", icon: "icon_smoke.jpg", need: 1, fa: true },
  { id: "sign", name: "Get Drew's sign-off", icon: "icon_facp.jpg", need: 1, fa: true },
];
const DAY14_JOBS = [
  { id: "tools", name: "Grab your good pen", icon: "icon_tools.jpg", need: 1 },
  { id: "checks", name: "Turnover checks", icon: "icon_smoke.jpg", need: 6, fa: true },
  { id: "signoffs", name: "Collect sign-offs", icon: "icon_box.jpg", need: 3, fa: true },
  { id: "facp", name: "ENERGIZE", icon: "icon_facp.jpg", need: 1, fa: true },
];
let JOBS = DAY1_JOBS;

const DAYS = {
  1: { jobs: DAY1_JOBS, shift: 600, name: "ROUGH-IN" },
  2: { jobs: DAY2_JOBS, shift: 480, name: "TRIM & TEST" },
  3: { jobs: DAY3_JOBS, shift: 540, name: "AHJ WALK" },
  4: { jobs: DAY4_JOBS, shift: 480, name: "NIGHT SHIFT" },
  5: { jobs: DAY5_JOBS, shift: 540, name: "THE BIG PULL" },
  6: { jobs: DAY6_JOBS, shift: 420, name: "PUNCH LIST" },
  7: { jobs: DAY7_JOBS, shift: 540, name: "ENERGIZE" },
  8: { jobs: DAY8_JOBS, shift: 540, name: "LOOP EXTEND" },
  9: { jobs: DAY9_JOBS, shift: 480, name: "DEVICE RETEST" },
  10: { jobs: DAY10_JOBS, shift: 480, name: "AHJ RETURN" },
  11: { jobs: DAY11_JOBS, shift: 480, name: "OT NIGHTS" },
  12: { jobs: DAY12_JOBS, shift: 540, name: "FEEDER 2" },
  13: { jobs: DAY13_JOBS, shift: 420, name: "CALLBACKS" },
  14: { jobs: DAY14_JOBS, shift: 540, name: "TURNOVER" },
};

const POWER_JOB = {
  conduit: "Run EMT",
  boxes: "Mount boxes",
  smokes: "Hang lights",
  nac: "Recs & switches",
  magtest: "Meg the feeders",
  troubles: "Chase opens",
  eol: "Land homeruns",
  demos: "Demo circuits",
  batteries: "Test emergency lights",
  ducts: "Reset occupancy sensors",
  term: "Land the feeder",
  pulls: "Pull the feeder",
  checks: "Final circuit checks",
};
const POWER_JOB_DAY = {
  1: { high: "High lights · scissor", facp: "Commission gear" },
  2: { high: "High fixtures · scissor", facp: "Walk-test gear" },
  3: { facp: "Final acceptance" },
  4: { high: "High sensors · scissor", facp: "Transfer to normal" },
  6: { high: "High punch · scissor" },
  7: { facp: "ENERGIZE" },
  8: { conduit: "Extend EMT", boxes: "Mount isolators", magtest: "Meg last week's run", facp: "Add the feeder card" },
  9: { magtest: "Retest every feeder", troubles: "Chase leftover opens", high: "High retest · scissor", facp: "Walk-test gear" },
  10: { demos: "Demo for the return walk", facp: "Final acceptance" },
  11: { high: "High sensors · scissor", facp: "Transfer to normal" },
  12: { reels: "Stage feeder-two reels", pulls: "Pull feeder two", term: "Land feeder two" },
  13: { punch: "Clear callbacks", high: "High callback · scissor" },
  14: { checks: "Turnover checks", facp: "ENERGIZE" },
};
const POWER_PROMPT = {
  "Hang red EMT": "Hang EMT",
  "Mount FA box": "Mount box",
  "Hang smoke": "Hang light",
  "Mount horn-strobe": "Mount rec",
  "Mount pull station": "Mount switch",
  "Commission FACP": "Commission gear",
  "Mount the high smoke": "Mount the high light",
  "Mag-test smoke": "Meg the feeder",
  "Chase trouble": "Chase open",
  "Swap EOL resistor": "Land homerun",
  "Land NAC 470Ω EOL": "Land homerun",
  "Mag the high smoke": "Meg the high fixture",
  "Walk-test FACP": "Walk-test gear",
  "Demo for the AHJ": "Demo for the inspector",
  "Test battery backup": "Test emergency light",
  "Reset duct detector": "Reset occupancy sensor",
  "Reset the high duct": "Reset the high sensor",
  "Punch: high candela": "Punch: high fixture",
  "Land the riser": "Land the feeder",
  "AHJ's sign-off": "Inspector's sign-off",
};

const WEEK2_NAMES = {
  1: "LOOP EXTEND",
  2: "DEVICE RETEST",
  3: "AHJ RETURN",
  4: "OT NIGHTS",
  5: "FEEDER 2",
  6: "CALLBACKS",
  7: "TURNOVER",
};

function jobDisplayName(j) {
  if (!j) return "";
  if (!isTremont()) return j.name;
  const dayMap = POWER_JOB_DAY[day] || POWER_JOB_DAY[cycleDay(day)];
  if (dayMap && dayMap[j.id]) return dayMap[j.id];
  return POWER_JOB[j.id] || j.name;
}
function shownLabel(s) {
  if (!isTremont() || !s) return s;
  return POWER_PROMPT[s] || s;
}
function dayDisplayName(d) {
  const c = cycleDay(d);
  const n =
    (DAYS[d] && DAYS[d].name) ||
    (weekOfDay(d) >= 2 ? WEEK2_NAMES[c] : null) ||
    (DAYS[c] || DAYS[1]).name;
  if (isTremont() && (n === "AHJ WALK" || n === "AHJ RETURN")) return n === "AHJ RETURN" ? "INSPECTOR RETURN" : "INSPECTOR WALK";
  return n;
}

const RADIO = {
  start: [
    "Lugo on three. Utah, Book 2, O'Connell. 237's call. Fire alarm. Grab your pouch, y'all — I got your time.",
    "CB-4 is four bays off a center corridor. Service wing west, data halls both sides. Red pipe first.",
  ],
  tools: ["Pouch is on. Run red EMT through the hallways and electrical corridors. Don't mix it with power."],
  conduit: ["That's the last stick. Mount the FA boxes, then devices. All four pods, y'all."],
  boxes: ["Boxes are up. Hang smokes in the data halls and corridors."],
  smokes: ["Smokes are on the loop. Strobes and pulls at the doors, then the FACP in electrical one."],
  nac: ["NAC's loaded. VESDAs in the fan crawl next — land the aux off the print. Then FACP."],
  vesda: ["VESDAs are on the aux. Fault contacts stay hot in normal — don't kill 24V. FACP on the corridor, pod one."],
  facp: ["Panel's green. All four halls are covered. That's a Book 2 fire alarm, brother."],
  checks: ["Loop looks honest. Three pens: me on the hall, Drew in the yard, AHJ at the panel. Then we hit the big one."],
  signoffs: ["Cards are signed. FACP on the corridor, pod one. ENERGIZE, SILENCE, RESET."],
  magtest: ["Every smoke reads clean. That's a loop that'll pass paper."],
  troubles: ["Troubles cleared. Panel's quiet. I'm almost impressed, Utah."],
  eol: ["EOLs are swapped. Supervision's honest now."],
  batteries: ["Battery backups read honest. Reset the ducts, then we hand the building back to utility."],
  ducts: ["Ducts are reset. FACP on the corridor — TRANSFER when the list is clean."],
  high: ["High work's done. Don't leave the scissor sitting in the hall."],
  demos: ["He saw a clean demo. Stay ahead of the blue diamond, y'all."],
  reels: ["Reels are staged. Now pull. Smooth, not stupid."],
  pulls: ["Riser's in the pipe. Land it at the panel."],
  term: ["Riser's landed. That's the pull. Don't nick it."],
  punch: ["List is clear. Find Drew in the yard. He signs, we eat."],
  sign: ["Drew signed. That's the punch list. Don't add to it."],
  wet: ["That's a puddle, not a spa."],
  shock: [
    "That's 277 looking for a path. Don't be the path.",
    "Walk it off, y'all. Hair'll grow back.",
    "If it sparks, it's working. If YOU spark, I fill out paperwork.",
  ],
  coffee: ["Wendel's finest. Tastes like a 345-kV splice and regret."],
  forklift: [
    "FORKLIFT. Yellow iron has the right of way, genius.",
    "That's a lift, not a suggestion. Get off his travel lane.",
    "He honked. You didn't move. That's on you, y'all.",
  ],
  idleAlways: [
    "Four bays off the corridor, Utah. Don't y'all get lost in the east hall.",
    "We're Book 2 on a 237 call. Don't embarrass the travelers.",
    "Ten hours, seven days. I got the book. Don't make me eat your time.",
    "237's hall is Niagara. We're the ones filling it.",
    "Fan crawl's loud. That's the wall pushing air into the hall. VESDAs live in there.",
    "Rivera's lighting his boys up in the east hall. Walk wide, y'all.",
    "CB-5's all iron and mud. Stay out of Ferguson's laydown, y'all.",
    "Miner row's still humming. That's the old money paying for the new building.",
    "See that stack up the shore? Old coal plant. This whole site ran on Somerset coal. Now it runs on megawatts.",
    "Water's in the conex. Hydrate or die-drate, y'all.",
    "Back in Texas we'd have this loop in by lunch. Y'all move like it's already snowing.",
    "UPS trailers and transformers are live-adjacent. Don't climb them for a photo, Utah.",
  ],
  facpNight: ["Utility's back, y'all. Halls stay lit. Kill the diesel on your way out."],
};


const RADIO_LEMON = {
  start: [
    "Lemon. Channel three. Tremont, you're on my book. Power, CB-4. Lighting and feeders. Pouch on. I got your time.",
    "Four bays. Service west, corridor down the middle, halls both sides. EMT first. Stay tight.",
  ],
  tools: ["Pouch is on. Run the EMT. Lighting and homeruns. Clean bends."],
  conduit: ["Last stick. Boxes next, then lights. All four pods. Don't dog it."],
  boxes: ["Boxes are up. Hang lights in the data halls and the corridors."],
  smokes: ["Lights are on. Recs and switches at the doors, then my gear in electrical one."],
  nac: ["Devices landed. Gear is on the corridor, pod one. Don't leave it in trouble."],
  facp: ["Gear's green. Four halls covered. That's a clean panel. That's the job."],
  checks: ["Circuits look honest. Three pens: me on the hall, Drew in the yard, the inspector at the gear. Then we energize."],
  signoffs: ["Cards are signed. Gear, corridor, pod one. RACK IN. ENERGIZE."],
  magtest: ["Every feeder megs clean. That's a run that passes paper."],
  troubles: ["Opens cleared. Panel's quiet. Keep that discipline, Tremont."],
  eol: ["Homeruns are landed. Terminations are honest."],
  batteries: ["Emergency lights read honest. Reset the sensors, then we hand the building back to utility."],
  ducts: ["Sensors are reset. Gear on the corridor — TRANSFER when the list is clean."],
  high: ["High work's done. Don't leave the scissor sitting in the hall."],
  demos: ["He saw a clean demo. Stay ahead of the blue diamond."],
  reels: ["Reels are staged. Now pull. Controlled power. Don't yank it."],
  pulls: ["Feeder's in the pipe. Land it at the gear."],
  term: ["Feeder's landed. That's the pull. Don't nick it."],
  punch: ["List is clear. Find Drew in the yard. He signs, we eat."],
  sign: ["Drew signed. That's the punch list. Don't add to it."],
  wet: ["That's a puddle. Walk around it. You're not here to swim."],
  shock: [
    "That's 480 looking for a path. Don't be the path.",
    "Walk it off. Then get back on the circuit.",
    "If YOU spark, I fill out paperwork. Don't make me fill out paperwork.",
  ],
  coffee: ["Black coffee. That's it. Leave the sugar sludge."],
  forklift: [
    "FORKLIFT. Yellow iron has the right of way. Get off the path.",
    "That's five thousand pounds of lift. You don't win that argument.",
    "Walk around the iron. Don't make me write a near-miss.",
  ],
  idleAlways: [
    "Four bays. Don't get lost in the east hall.",
    "Water's in the conex. Hydrate like you mean it.",
    "Book 2 on a 237 call. Don't embarrass the hall.",
    "Ten hours, seven days. I got the book. Don't make me eat your time.",
    "Form over force. Same rule on the iron and in the gym.",
    "If you need a break, make it water and air. Then get back on the stick.",
    "CB-5 is iron and mud. Stay out of Ferguson's laydown.",
    "Fan crawl's loud. That's the wall pushing air. Work through it.",
    "Rivera's lighting his boys up in the east hall. Walk wide. That's not our circus.",
    "Stay productive. Stretching is for between circuits, not instead of them.",
    "Tremont's truck is the Ford in the south lot. Don't block it.",
    "PowerBoost in the lot. Quiet on the gate, loud when I tow.",
    "After the whistle I'm in the gym. Until then it's the circuit.",
    "Don't skip the work for a set. The set is the reward.",
    "Water's in the conex. Not Squenchers. Water.",
  ],
  facpNight: ["Utility's back. Halls stay lit. Shutdown the diesel when you walk out."],
};

const WEEK2_START = {
  1: [
    "Week two, y'all. Loop's in from last week. Now we extend it. Grab your pouch.",
    "Don't rest on last week's score. Same halls, new list.",
  ],
  2: [
    "Week two trim. Mag it again like you've never seen this loop.",
    "Device retest, y'all. Honest readings or we walk it twice.",
  ],
  3: [
    "AHJ came back, y'all. Week two walk. Stay ahead of the blue diamond.",
    "He already saw last week's demo. Don't give him a reason to write us up.",
  ],
  4: [
    "Week two nights. Diesel's still east of the south doors. Keep her fed.",
    "OT nights, y'all. Battery strobes, ducts, TRANSFER. Same as last Thursday, colder.",
  ],
  5: [
    "Second pull, y'all. Feeder two. Same tugger, don't get cute.",
    "Hold the pull, let off before the redline. Cable still ain't free.",
  ],
  6: [
    "Callbacks, y'all. Drew found more with the pencil. Clear week two's list.",
    "No markers again. You know the site. Find the work, then find Drew.",
  ],
  7: [
    "Turnover day. Week two energize. Same big one, new signatures.",
    "The hall's watching CB-4 again. Checks, pens, then the green.",
  ],
};

const WEEK2_START_LEMON = {
  1: [
    "Week two. Loop's in. Now we extend it. Pouch on, Tremont.",
    "Last week's score is last week. New seven. Stay tight.",
  ],
  2: [
    "Week two trim. Meg it like the first time. No coasting.",
    "Device retest. Honest readings. Don't get cute.",
  ],
  3: [
    "Inspector came back. Week two walk. Stay ahead of the blue diamond.",
    "He saw last week. Don't give him a write-up.",
  ],
  4: [
    "Week two nights. Diesel east of the south doors. Keep her fed.",
    "OT nights. Emergency lights, sensors, TRANSFER. Same drill.",
  ],
  5: [
    "Second pull. Feeder two. Controlled power. Don't yank it.",
    "Hold the pull, let off before the redline. Cable isn't free.",
  ],
  6: [
    "Callbacks. Drew found more. Clear week two's list.",
    "No markers. You know the site. Then find Drew.",
  ],
  7: [
    "Turnover. Week two energize. Checks, pens, the green.",
    "Whole site's watching CB-4 again. Stay on the checks.",
  ],
};

const DAY_START = {
  2: [
    "Day two, y'all. Loop's in — now we make it honest. Mag the smokes, chase my troubles, walk the panel.",
    "AHJ walks at end of shift. Meter bag's in the crib. Ten-hour day — we call it eight minutes.",
  ],
  3: [
    "AHJ's on site, y'all. He walks to a device, you beat him there and demo it clean. Three corrections and we re-walk Monday.",
    "Blue diamond is where he's headed next. Stay ahead of the man.",
  ],
  4: [
    "Night shift, y'all. Utility's locked out. CB-4 is on the diesel east of the south doors. Test the battery strobes, reset the ducts, then TRANSFER back to normal at the FACP.",
    "Keep diesel in her while you work. When she dies you're on the lamp and the tests don't mean a thing.",
  ],
  5: [
    "Pull day, y'all. Reels from the rack to every pod, then pull the riser section by section. Cable ain't free.",
    "Hold the pull, let off before the redline. Work it like a big fish.",
  ],
  6: [
    "Drew walked the job with a pencil, y'all. Ten punch items, no markers. The list says where — you know this site by now.",
    "Clear the list, then find Drew for the sign-off. He's walking the yard.",
  ],
  7: [
    "Energize day, y'all. Final checks, three signatures, then hit the big one. The whole site's watching CB-4 today.",
    "Everything's hot and everyone's stupid today. Watch the floor and get your checks done.",
  ],
};


const DAY_START_LEMON = {
  2: [
    "Day two. Pipe's in. Meg the feeders, chase the opens, walk my gear. Stay sharp the whole ten.",
    "Inspector walks at the end of shift. Meter bag's in the crib. Don't get cute.",
  ],
  3: [
    "Inspector's on site. He walks to a device, you beat him there and show it clean. Three corrections and we re-walk Monday.",
    "Blue diamond is where he's headed. Stay ahead of the man. No posing.",
  ],
  4: [
    "Night shift. Utility's locked out. CB-4 is on the diesel east of the south doors. Emergency lights, occupancy sensors, then TRANSFER back to normal at the gear.",
    "Keep diesel in her while you work. When she dies you're on the lamp. Tests don't count in the dark.",
  ],
  5: [
    "Pull day. Reels to every pod, then the feeder section by section. Controlled power. Cable isn't free.",
    "Hold the pull, let off before the redline. Same as a clean set — don't yank it.",
  ],
  6: [
    "Drew walked it with a pencil. Ten punch items, no markers. You know this site. Clear the list.",
    "Then find Drew for the sign-off. He's walking the yard. Don't make him hunt you.",
  ],
  7: [
    "Energize day. Final checks, three signatures, then the big one. Whole site's watching CB-4.",
    "Everything's hot. Stay on the checks. Nobody wants a hero today.",
  ],
};

const UTAH_LINE = {
  tools: "Pouch is on. Let's get this loop in.",
  conduit: "That's a stick.",
  boxes: "Box is up.",
  smokes: "Smoke's on the loop.",
  nac: "Device is landed.",
  vesda: "Vesda's on the aux.",
  facp: "Panel's green, Lugo.",
};

const TREMONT_LINE = {
  tools: "Pouch on. Blood moving. Let's hang iron.",
  conduit: "Stick's in. Form's solid.",
  boxes: "Box is tight. Next set.",
  smokes: "Lights are up. Don't skip the work either.",
  nac: "Rec's landed. F-150's in the lot. Let's finish this.",
  facp: "Gear's green, Lemon. Built different over here.",
};

const BARK = {
  foreman: [
    "Y'all good on material, Utah?",
    "Drew's asking. I'm stalling. Work faster.",
    "I got your time. You get the work.",
  ],
  foremanLemon: [
    "Material good, Tremont? Don't wait on me.",
    "Drew's asking. I'm stalling. Finish the device.",
    "I got the book. You get the work.",
  ],
  oconnell: ["Hey Utah.", "Book 2, O'Connell. Same stick.", "Watch your head on that tray."],
  oconnellTremont: ["Hey Tremont.", "Book 2. Same stick.", "Watch your head on that tray."],
  ferguson: ["Ferguson, east electrical.", "You boys with O'Connell?", "We're landing gear. Stay in your lane."],
  pipe: ["Pipefitters, coming through.", "Hot work. Keep walking."],
  labor: ["Coming through.", "Yard's a mess today."],
  nate: [
    "You got wieners?",
    "Beer in the cooler. Don't tell Drew.",
    "Wieners and beer. That's lunch. That's the whole program.",
    "Who took the last wiener.",
    "I said wieners AND beer. Not just beer.",
    "Nate's got the cooler. Wieners first, then the beer.",
  ],
  kenny: [
    "Sixty bucks. Tie-dye. Don't even ask.",
    "Kenny the stew. Shirt's not from the trailer.",
    "This dye job cost more than your boots.",
    "You want one? Sixty. Cash.",
    "Don't get stew on the shirt. That's a sixty-dollar shirt.",
  ],
  safety: [
    "Glasses. On. Now.",
    "Tied off or you come down.",
    "Where is the lift inspection.",
    "Don't look at me like that.",
    "Both feet on the deck.",
    "Harness. I'm not asking.",
  ],
  redbeard: [
    "Red Beard. Data one. Keep it moving.",
    "This hall's live. Watch the tiles.",
    "You lost?",
    "Hot aisle. Don't camp in it.",
    "I'm Red Beard. That's the whole introduction.",
    "Row's tight. Squeeze through.",
  ],
  andy: [
    "Sick and needy fund. You in?",
    "Five bucks. Sick and needy. That's the ask.",
    "Andy. Donations for the sick and needy fund.",
    "Pass the hat. Somebody's out hurt.",
    "Local takes care of its own. Sick and needy fund.",
    "Folding money. Not IOUs.",
  ],
  millwright: ["Millwrights. Hands off the pumps.", "That's our iron, sparkie."],
  insulator: ["Insulators wrapping. Give us room.", "CHW's hot. Don't lean on it."],
  cleaner: ["Data hall's wet. Watch your boots.", "We're wiping down. Go around."],
};

/* kit -> speakAs role. Default is crew. Set this when a new NPC gets their own baked voice. */
const NPC_VOICE = { safety: "safety", redbeard: "redbeard", andy: "andy", nate: "nate", kenny: "kenny" };

const CB = {
  pods: 4,
  podH: 18,       // room depth N-S per section
  cross: 5.5,     // hallway between sections (doors live here)
  z0: 52,         // south wall
  // WEST → EAST strip (one data hall in the middle)
  // MECH | HALL_W | ELEC_W | FAN_W | DATA | FAN_E | ELEC_E | HALL_E
  west: -48,
  hallW0: -38,    // mech ends / west long hall starts
  elecW0: -32,    // west long hall ends / west electrical starts
  fanW0: -26,     // west electrical ends / west fan crawl starts
  data0: -22,     // west fan ends / DATA starts
  data1: 10,      // DATA ends / east fan starts  (32m data hall)
  fanE1: 14,      // east fan ends / east electrical starts
  elecE1: 20,     // east electrical ends / east long hall starts
  east: 28,       // east long hall ends
};
// derived
CB.zPod0 = CB.z0 + CB.cross; // first section after south cross-hall
CB.z1 = CB.zPod0 + CB.pods * CB.podH + (CB.pods - 1) * CB.cross + CB.cross; // +north cross
CB.dataX = (CB.data0 + CB.data1) / 2;
CB.hallWX = (CB.hallW0 + CB.elecW0) / 2; // center of west long hall
CB.hallEX = (CB.elecE1 + CB.east) / 2;   // center of east long hall
CB.elecWX = (CB.elecW0 + CB.fanW0) / 2;
CB.elecEX = (CB.fanE1 + CB.elecE1) / 2;
CB.fanWX = (CB.fanW0 + CB.data0) / 2;
CB.fanEX = (CB.data1 + CB.fanE1) / 2;
CB.mechX = (CB.west + CB.hallW0) / 2;
// aliases so older props/workers keep resolving
CB.corX = CB.dataX;
CB.cor0 = CB.data0;
CB.cor1 = CB.data1;
CB.westHallX = CB.hallWX;
CB.eastHallX = CB.hallEX;
CB.svc = CB.hallW0;
CB.svcX = CB.mechX;
CB.fanW = CB.data1; // east edge of data → start of east fan (legacy name)
CB.c5x0 = 78;
CB.c5x1 = 158;
const SPAWN = { x: CB.hallWX, z: CB.z0 - 8 };

function podOfZ(z) {
  if (z < CB.zPod0) return 0;
  return THREE.MathUtils.clamp(Math.floor((z - CB.zPod0) / (CB.podH + CB.cross)), 0, CB.pods - 1);
}
function podBand(i) {
  const z0 = CB.zPod0 + i * (CB.podH + CB.cross);
  return { z0, z1: z0 + CB.podH, mid: z0 + CB.podH * 0.5 };
}
/** z-range of the cross-hall south of pod i (i==0 is the south entry cross) */
function crossBand(i) {
  if (i <= 0) return { z0: CB.z0, z1: CB.zPod0, mid: (CB.z0 + CB.zPod0) / 2 };
  const after = podBand(i - 1).z1;
  return { z0: after, z1: after + CB.cross, mid: after + CB.cross * 0.5 };
}
function crossList() {
  const list = [];
  for (let i = 0; i <= CB.pods; i++) list.push(crossBand(i));
  return list;
}

/** Hot hallway: ONLY the center cross corridor between Data Hall 2 and Data Hall 3. 110°+. */
const HOT_CROSS = 2; // crossBand(2) = the corridor between pod index 1 (DH2) and pod index 2 (DH3)
function inHotAisle(x, z) {
  if (x < CB.data0 - 0.35 || x > CB.data1 + 0.35) return false;
  const c = crossBand(HOT_CROSS);
  return z >= c.z0 && z < c.z1;
}
/** gaps in N-S walls where cross-halls punch through (full open, no door) */
function crossGaps() {
  return crossList().map((c) => ({ z: c.mid, w: CB.cross - 0.3 }));
}
function zoneName(x, z) {
  if (x > 94 && x < 148 && z > -8 && z < 22) return "EAST PARKING";
  if (x > CB.c5x0) {
    if (z < 0) return "LOOP ROAD";
    return z > CB.z0 - 6 ? "CB-5 · IRON UP" : "CB-5 LAYDOWN";
  }
  if (x < -132 && z < 20) return "PARKING";
  if (x < -168 && z > 42 && z < 174) return "LANDFILL · SXS"; // course runs to the big landing at z≈170
  if (x < -148) {
    if (z > 130) return "COOLING PONDS";
    return "WEST FIELD";
  }
  if (x < -66) {
    if (z > 140) return "SOMERSET STATION";
    if (z < 22) return "PARKING";
    if (z < 66) return "SWITCHYARD";
    return "MINER ROW · LMD";
  }
  if (z < CB.z0 - 0.5) {
    if (z < 16 && x > CB.west + 8 && x < 56) return "SOUTH PARKING"; // the lot pad spans to x≈56
    if (z < 18 && x < CB.west + 20) return "PARKING";
    return "YARD · GATE";
  }
  if (z > CB.z1 + 28) return "LAKE ONTARIO";
  if (z > CB.z1 + 0.5) return "NORTH YARD · SHORE";
  if (x < CB.west - 0.5) return "WEST YARD";
  if (x > CB.east + 0.5) return "EAST YARD";
  if (inHotAisle(x, z)) return "HOT AISLE · 110°+";
  const p = podOfZ(z) + 1;
  // long hallways + cross-halls read as HALLWAY
  const inCross = crossList().some((c) => z >= c.z0 && z < c.z1);
  if (x >= CB.hallW0 && x < CB.elecW0) return inCross ? `CROSS · POD ${p}` : "WEST HALLWAY";
  if (x >= CB.elecE1 && x < CB.east) return inCross ? `CROSS · POD ${p}` : "EAST HALLWAY";
  if (inCross) return `CROSS · POD ${p}`;
  if (x < CB.hallW0) return "MECHANICAL";
  if (x < CB.fanW0) return `POD ${p} · ELECTRICAL`;
  if (x < CB.data0) return `POD ${p} · FAN CRAWL`;
  if (x < CB.data1) return `POD ${p} · DATA`;
  if (x < CB.fanE1) return `POD ${p} · FAN CRAWL`;
  if (x < CB.elecE1) return `POD ${p} · ELECTRICAL`;
  return "EAST HALLWAY";
}

/* ------------------------------------------------------------------ */
/*  AUDIO                                                              */
/* ------------------------------------------------------------------ */
const audio = {
  ctx: null,
  master: null,
  hum: null,
  humGain: null,
  started: false,
};

function ensureAudio() {
  if (audio.ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  audio.ctx = new AC();
  audio.master = audio.ctx.createGain();
  audio.master.gain.value = 0.22;
  audio.master.connect(audio.ctx.destination);
}

function resumeAudio() {
  ensureAudio();
  audio.ctx.resume().catch(() => {});
  if (!audio.started) {
    audio.started = true;
    drone();
  }
}

/* iOS puts the AudioContext into "interrupted" after a call/lock; the
   standard recovery is a resume() inside any fresh user gesture. */
function recoverAudio() {
  if (audio.ctx && audio.ctx.state !== "running") audio.ctx.resume().catch(() => {});
}

function isAppleMobile() {
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  // iPadOS 13+ reports as MacIntel with touch
  if (navigator.platform === "MacIntel" && (navigator.maxTouchPoints || 0) > 1) return true;
  return false;
}

/* TTS MP3s are encoded with a lot of headroom. iOS then plays Web Audio
   quieter than Android. Bring average loudness up, then cap peaks. */
function loudnessFix(buf) {
  if (!buf || buf._lw) return buf;
  let peak = 0;
  let sum = 0;
  let n = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    n += d.length;
    for (let i = 0; i < d.length; i++) {
      const x = d[i];
      sum += x * x;
      const a = x < 0 ? -x : x;
      if (a > peak) peak = a;
    }
  }
  buf._lw = 1;
  if (!n || peak < 0.02) return buf;
  const rms = Math.sqrt(sum / n);
  const target = 0.24;
  let g = rms > 0.001 ? target / rms : 1;
  g = Math.min(g, 0.97 / peak, 10);
  if (g < 1.04) return buf;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      let y = d[i] * g;
      if (y > 0.97) y = 0.97;
      else if (y < -0.97) y = -0.97;
      d[i] = y;
    }
  }
  return buf;
}

function ensureVoiceBus() {
  if (audio.voiceOut) return audio.voiceOut;
  ensureAudio();
  const inG = audio.ctx.createGain();
  // iOS Web Audio sits ~8–12 dB under Chrome/Android. Push dialogue up,
  // then limit so it doesn't square-wave.
  inG.gain.value = isAppleMobile() ? 2.6 : 1.2;
  const comp = audio.ctx.createDynamicsCompressor();
  comp.threshold.value = -22;
  comp.knee.value = 10;
  comp.ratio.value = 3.2;
  comp.attack.value = 0.004;
  comp.release.value = 0.16;
  const lim = audio.ctx.createDynamicsCompressor();
  lim.threshold.value = -1.5;
  lim.knee.value = 0;
  lim.ratio.value = 20;
  lim.attack.value = 0.001;
  lim.release.value = 0.06;
  inG.connect(comp);
  comp.connect(lim);
  lim.connect(audio.ctx.destination);
  audio.voiceOut = inG;
  return inG;
}

function setDrone(on) {
  if (audio.humGain) audio.humGain.gain.value = on ? 0.03 : 0;
}

function tone(freq, dur, type = "square", gain = 0.08, slide = 0) {
  if (!audio.ctx) return;
  const t = audio.ctx.currentTime;
  const o = audio.ctx.createOscillator();
  const g = audio.ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g);
  g.connect(audio.master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noiseBurst(dur = 0.18, gain = 0.12) {
  if (!audio.ctx) return;
  const n = audio.ctx.sampleRate * dur;
  const buf = audio.ctx.createBuffer(1, n, audio.ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = audio.ctx.createBufferSource();
  src.buffer = buf;
  const bp = audio.ctx.createBiquadFilter();
  bp.type = "highpass";
  bp.frequency.value = 1800;
  const g = audio.ctx.createGain();
  g.gain.value = gain;
  src.connect(bp);
  bp.connect(g);
  g.connect(audio.master);
  src.start();
}

function drone() {
  if (!audio.ctx) return;
  const o = audio.ctx.createOscillator();
  const g = audio.ctx.createGain();
  o.type = "sawtooth";
  o.frequency.value = 55;
  g.gain.value = 0.03;
  audio.humGain = g;
  const f = audio.ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 180;
  o.connect(f);
  f.connect(g);
  g.connect(audio.master);
  o.start();
  audio.hum = o;
}

function sfx(name) {
  if (!settings.sfx) return;
  if (name === "pickup") {
    tone(660, 0.08, "square", 0.07);
    tone(990, 0.12, "square", 0.05);
  } else if (name === "ok") {
    tone(440, 0.09, "triangle", 0.07);
    tone(660, 0.14, "triangle", 0.06);
  } else if (name === "bad") {
    tone(140, 0.22, "sawtooth", 0.09, -60);
    noiseBurst(0.16, 0.1);
  } else if (name === "zap") {
    noiseBurst(0.22, 0.16);
    tone(90, 0.2, "sawtooth", 0.1, 40);
  } else if (name === "fork") {
    tone(90, 0.16, "sine", 0.12, -25);
    tone(240, 0.09, "square", 0.06);
    noiseBurst(0.1, 0.07);
  } else if (name === "thud") {
    tone(70, 0.12, "sine", 0.1, -20);
  } else if (name === "radio") {
    noiseBurst(0.08, 0.05);
    tone(420, 0.05, "square", 0.03);
  } else if (name === "win") {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.28, "triangle", 0.08), i * 140));
  } else if (name === "step") {
    tone(90 + Math.random() * 30, 0.04, "sine", 0.025);
  } else if (name === "horn") {
    // ANSI temporal-3: three half-second blasts, half-second gaps
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        tone(520, 0.5, "square", 0.07);
        tone(659, 0.5, "square", 0.035);
      }, i * 1000);
    }
  } else if (name === "gull") {
    tone(1400, 0.15, "square", 0.05, -600);
    setTimeout(() => tone(1250, 0.18, "square", 0.045, -520), 190);
  } else if (name === "strobe") {
    tone(1400, 0.04, "square", 0.03);
  }
}

/* jobsite boombox — west long hallway, first section. Hear it in that
   hall; it dies before you leave the area. */
const SITE_RADIO = {
  x: CB.hallWX,
  z: 66, // pod 0 west hallway (zPod0..zPod0+podH)
  inner: 3.2,
  outer: 17,
  max: 0.4,
  buf: null,
  src: null,
  gain: null,
  loading: false,
};

function loadSiteRadio() {
  if (SITE_RADIO.buf || SITE_RADIO.loading) return;
  SITE_RADIO.loading = true;
  fetch("/assets/utah_is_gay.mp3")
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
    .then((ab) => {
      ensureAudio();
      return audio.ctx.decodeAudioData(ab.slice(0));
    })
    .then((buf) => {
      SITE_RADIO.buf = buf;
      if (state.mode === "play" || state.mode === "mag" || state.mode === "pull") startSiteRadio();
    })
    .catch(() => {
      SITE_RADIO.loading = false;
    });
}

function startSiteRadio() {
  ensureAudio();
  if (SITE_RADIO.src) return;
  if (!SITE_RADIO.buf) {
    loadSiteRadio();
    return;
  }
  const src = audio.ctx.createBufferSource();
  src.buffer = SITE_RADIO.buf;
  src.loop = true;
  const g = audio.ctx.createGain();
  g.gain.value = 0;
  src.connect(g);
  g.connect(audio.ctx.destination);
  src.start();
  SITE_RADIO.src = src;
  SITE_RADIO.gain = g;
  src.onended = () => {
    if (SITE_RADIO.src === src) SITE_RADIO.src = null;
  };
  startUtvRadio();
}

const UTV_RADIO = { src: null, gain: null, max: 0.34, inner: 2.2, outer: 9 };

function startUtvRadio() {
  ensureAudio();
  if (UTV_RADIO.src || !SITE_RADIO.buf || !audio.ctx) return;
  const src = audio.ctx.createBufferSource();
  src.buffer = SITE_RADIO.buf;
  src.loop = true;
  const g = audio.ctx.createGain();
  g.gain.value = 0;
  src.connect(g);
  g.connect(audio.ctx.destination);
  src.start();
  UTV_RADIO.src = src;
  UTV_RADIO.gain = g;
  src.onended = () => {
    if (UTV_RADIO.src === src) UTV_RADIO.src = null;
  };
}

function utvRadioLevel() {
  if (!settings.sfx) return 0;
  if (state.mode !== "play" && state.mode !== "mag" && state.mode !== "pull") return 0;
  if (dayState.utv) return UTV_RADIO.max;
  let best = 0;
  for (const u of state.utvs || []) {
    const dist = Math.hypot(player.position.x - u.mesh.position.x, player.position.z - u.mesh.position.z);
    if (dist >= UTV_RADIO.outer) continue;
    const t = dist <= UTV_RADIO.inner ? 1 : (UTV_RADIO.outer - dist) / (UTV_RADIO.outer - UTV_RADIO.inner);
    best = Math.max(best, t * t * UTV_RADIO.max * 0.55);
  }
  return best;
}

function stopSiteRadio() {
  try {
    SITE_RADIO.src?.stop();
  } catch (_) {}
  SITE_RADIO.src = null;
  SITE_RADIO.gain = null;
  try {
    UTV_RADIO.src?.stop();
  } catch (_) {}
  UTV_RADIO.src = null;
  UTV_RADIO.gain = null;
}

function siteRadioLevel() {
  if (!settings.sfx) return 0;
  if (state.mode !== "play" && state.mode !== "mag" && state.mode !== "pull") return 0;
  const dist = Math.hypot(player.position.x - SITE_RADIO.x, player.position.z - SITE_RADIO.z);
  if (dist >= SITE_RADIO.outer) return 0;
  if (dist <= SITE_RADIO.inner) return SITE_RADIO.max;
  const t = (SITE_RADIO.outer - dist) / (SITE_RADIO.outer - SITE_RADIO.inner);
  return t * t * SITE_RADIO.max;
}

function updateSiteRadio() {
  const v = siteRadioLevel();
  if (SITE_RADIO.gain && audio.ctx) {
    SITE_RADIO.gain.gain.setTargetAtTime(v, audio.ctx.currentTime, 0.07);
  }
  const led = SITE_RADIO.led;
  if (led && led.material) {
    led.material.color.setHex(v > 0.02 ? 0x3dff6a : 0x4a1a14);
  }
  if (!UTV_RADIO.src && SITE_RADIO.buf) startUtvRadio();
  const uv = utvRadioLevel();
  if (UTV_RADIO.gain && audio.ctx) {
    UTV_RADIO.gain.gain.setTargetAtTime(uv, audio.ctx.currentTime, 0.07);
  }
}

/* ------------------------------------------------------------------ */
/*  DOM                                                                */
/* ------------------------------------------------------------------ */
const $ = (id) => document.getElementById(id);
const canvas = $("c");

/* ------------------------------------------------------------------ */
/*  SETTINGS / PERSISTENCE                                             */
/* ------------------------------------------------------------------ */
const settings = { sfx: true, voice: true, sens: 1, swap: false, mp: true };
try {
  Object.assign(settings, JSON.parse(localStorage.getItem("lw_settings") || "{}"));
} catch (_) {}
// v85: quota scare had defaulted MP off — turn the hall back on once
try {
  if (localStorage.getItem("lw_mp_v85") !== "1") {
    settings.mp = true;
    localStorage.setItem("lw_mp_v85", "1");
    localStorage.setItem("lw_settings", JSON.stringify(settings));
  }
} catch (_) {}

function saveSettings() {
  try {
    localStorage.setItem("lw_settings", JSON.stringify(settings));
  } catch (_) {}
}

/* one record slot per day AND traveler — Utah and Tremont don't share a PB */
function bestKey(d, who) {
  return "lw_best_d" + (d || day) + "_" + (who || getTraveler());
}
function loadBest(d, who) {
  who = who || getTraveler();
  try {
    const per = JSON.parse(localStorage.getItem(bestKey(d, who)) || "null");
    if (per) return per;
    // pre-split slots were Utah-only
    if (who === "utah") {
      const old = JSON.parse(localStorage.getItem("lw_best_d" + (d || day)) || "null");
      if (old) return old;
      if ((d || day) === 1) return JSON.parse(localStorage.getItem("lw_best") || "null");
    }
    return null;
  } catch (_) {
    return null;
  }
}

function saveBest(rec) {
  try {
    localStorage.setItem(bestKey(day, getTraveler()), JSON.stringify({ ...rec, who: getTraveler() }));
  } catch (_) {}
}

function anyBest() {
  try {
    if (localStorage.getItem("lw_best")) return true;
    for (let d = 1; d <= 7; d++) {
      if (localStorage.getItem("lw_best_d" + d)) return true;
      if (localStorage.getItem("lw_best_d" + d + "_utah")) return true;
      if (localStorage.getItem("lw_best_d" + d + "_tremont")) return true;
    }
    return false;
  } catch (_) {
    return false;
  }
}

/* one checkpoint slot per day — clocking into day 2 must never eat a day-1 run */
function saveKey(d) {
  return "lw_save_d" + (d || day);
}

function loadCheckpoint(d) {
  try {
    const save = JSON.parse(localStorage.getItem(saveKey(d)) || "null");
    if (save && save.v !== SAVE_VERSION) return null; // stale save from an older layout
    return save;
  } catch (_) {
    return null;
  }
}

function clearCheckpoint() {
  try {
    localStorage.removeItem(saveKey(day));
    localStorage.removeItem("lw_save"); // pre-day-system legacy slot
  } catch (_) {}
}

function vib(pattern) {
  if (settings.sfx) navigator.vibrate?.(pattern);
}

/* ------------------------------------------------------------------ */
/*  THE GANG BOX — spend career PTS on drip                            */
/* ------------------------------------------------------------------ */
const STORE = [
  { id: "shirt_red", slot: "shirt", name: "O'CONNELL RED TEE", price: 0 },
  { id: "shirt_pride", slot: "shirt", name: "PRIDE TEE · UTAH ONLY", price: 9000, utahOnly: true },
  { id: "shirt_black", slot: "shirt", name: "CRESCENT MOON BLACK", price: 7500 },
  { id: "shirt_blue", slot: "shirt", name: "LOCAL 237 BLUE", price: 7500 },
  { id: "pants_jeans", slot: "pants", name: "BROKE-IN JEANS", price: 0 },
  { id: "pants_khaki", slot: "pants", name: "FOREMAN KHAKIS", price: 6000 },
  { id: "pants_black", slot: "pants", name: "BLACKOUT PANTS", price: 6000 },
  { id: "hat_white", slot: "hat", name: "WHITE LID", price: 0 },
  { id: "hat_black", slot: "hat", name: "BLACK LID", price: 6500 },
  { id: "hat_cowboy", slot: "hat", name: "FULL-BRIM · TEXAS APPROVED", price: 12000 },
  { id: "x_none", slot: "extra", name: "NO EXTRAS", price: 0 },
  { id: "x_chain", slot: "extra", name: "GOLD CHAIN", price: 10000 },
  { id: "x_squints", slot: "extra", name: "SAFETY SQUINTS", price: 4500 },
];
const SLOT_LABEL = { shirt: "SHIRTS", pants: "PANTS", hat: "LIDS", extra: "EXTRAS" };

function getWallet() {
  try {
    const v = Number(localStorage.getItem("lw_wallet") || 0);
    return Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
  } catch (_) {
    return 0;
  }
}
function addWallet(n) {
  try {
    localStorage.setItem("lw_wallet", String(Math.max(0, getWallet() + Math.round(n))));
  } catch (_) {}
}
function getOwned() {
  try {
    return JSON.parse(localStorage.getItem("lw_owned") || "[]");
  } catch (_) {
    return [];
  }
}
function getOutfit() {
  try {
    return Object.assign(
      { shirt: "shirt_red", pants: "pants_jeans", hat: "hat_white", extra: "x_none" },
      JSON.parse(localStorage.getItem("lw_outfit") || "{}")
    );
  } catch (_) {
    return { shirt: "shirt_red", pants: "pants_jeans", hat: "hat_white", extra: "x_none" };
  }
}
/** Outfit as worn on the current traveler — pride tee is Utah-only. */
function wornOutfit() {
  const fit = getOutfit();
  if (getTraveler() === "tremont" && fit.shirt === "shirt_pride") {
    return Object.assign({}, fit, { shirt: "shirt_red" });
  }
  return fit;
}
function getTraveler() {
  try {
    return localStorage.getItem("lw_traveler") === "tremont" ? "tremont" : "utah";
  } catch (_) {
    return "utah";
  }
}
function isTremont() {
  return getTraveler() === "tremont";
}
function setTraveler(t) {
  try {
    localStorage.setItem("lw_traveler", t === "tremont" ? "tremont" : "utah");
  } catch (_) {}
}
function foremanWho() {
  return isTremont() ? "lemon" : "lugo";
}
function travelerName() {
  return isTremont() ? "Tremont" : "Utah";
}
function foremanName() {
  return isTremont() ? "Lemon" : "Lugo";
}
/** Drew keeps the same jokes; names match who's actually on site. */
function drewLine(s) {
  if (!isTremont()) return s;
  return String(s).replace(/\bUtah\b/g, "Tremont").replace(/\bLugo\b/g, "Lemon");
}
function ownsItem(id) {
  const item = STORE.find((s) => s.id === id);
  return (item && item.price === 0) || getOwned().includes(id);
}

/* analytics — no-op wherever gtag is absent (local dev, blockers, artifact) */
function track(name, params) {
  try {
    window.gtag?.("event", name, params);
  } catch (_) {}
}

/* ------------------------------------------------------------------ */
/*  SITE BOARD — one slot per hand. Ranked by high score.              */
/*  Shows highest day landed, best PTS, and the time of that run.      */
/* ------------------------------------------------------------------ */
const FS_DOCS = "https://firestore.googleapis.com/v1/projects/livewire-lakemariner/databases/(default)/documents";
const FS_KEY = "AIzaSyCXoDoOUxrhRgxUo9q1KMskl8khYCnyx-k";
const BOARD_CACHE = "lw_board_v3";
const BOARD_PENDING = "lw_board_pending";
try { localStorage.removeItem("lw_board_v2"); } catch (_) {}
const PLAYS_CACHE = "lw_plays_v1";
/* last known good walk-on count — never paint 0 over a real cloud number */
const PLAYS_FLOOR = 19;

let fsCoolUntil = 0;
let fsLastStatus = 0;
let boardNote = "";
let flushing = false;
let boardCloudOk = false;
let netLive = false; // presence/chat only when explicitly on and gate is open

function fsCooling() {
  return Date.now() < fsCoolUntil;
}

function noteFsStatus(status) {
  fsLastStatus = status | 0;
  // Presence/chat 429s must NOT freeze the scoreboard. Cool the noisy
  // channels only — postScore always tries.
  if (status === 429) fsCoolUntil = Math.max(fsCoolUntil, Date.now() + 30 * 60 * 1000);
}

async function fsFetch(url, opt, force) {
  if (!force && fsCooling()) {
    const err = new Error("cool");
    err.status = 429;
    throw err;
  }
  const r = await fetch(url, opt);
  noteFsStatus(r.status);
  return r;
}

function travelerTag(who) {
  return who === "tremont" ? "TREMONT" : "UTAH";
}

function handKey(name, local, who) {
  return String(name || "").trim().toUpperCase() + "|" + (who === "tremont" ? "tremont" : "utah");
}

function careerKey(name, local) {
  // Name only — same hand with/without a local # is one person on every phone
  return String(name || "").trim().toUpperCase();
}

function handId(name, local, who) {
  const s = (
    String(name || "HAND").trim().toUpperCase() +
    (who === "tremont" ? "_TREMONT" : "")
  ).replace(/[^A-Z0-9_]/g, "");
  return s.slice(0, 64) || "HAND";
}

function ptsNum(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function fieldPts(f) {
  if (!f) return 0;
  if (f.integerValue != null) return ptsNum(f.integerValue);
  if (f.doubleValue != null) return ptsNum(f.doubleValue);
  if (f.stringValue != null) return ptsNum(f.stringValue);
  return 0;
}

function parseScoreFields(f) {
  if (!f) return null;
  return {
    name: (f.name && f.name.stringValue) || "?",
    local: (f.local && f.local.stringValue) || "",
    pts: fieldPts(f.pts),
    seconds: Number((f.seconds && f.seconds.integerValue) || 0),
    rank: (f.rank && f.rank.stringValue) || "",
    day: Number((f.day && f.day.integerValue) || 1),
    level: Number((f.bestDay && f.bestDay.integerValue) || (f.day && f.day.integerValue) || 1),
    who: (f.who && f.who.stringValue) === "tremont" ? "tremont" : "utah",
  };
}

function parseHandCareer(f, docId) {
  const base = parseScoreFields(f);
  if (!base) return null;
  if (docId && /_TREMONT$/i.test(docId) && !(f.who && f.who.stringValue)) base.who = "tremont";
  let level = Number(base.level || 0);
  let pts = base.pts || 0;
  let seconds = base.seconds || 0;
  let rank = base.rank || "";
  let day = base.day || 1;
  let total = 0;
  const dayScores = {};
  const listedBest = Number((f.bestDay && f.bestDay.integerValue) || 0);
  if (listedBest > level) level = listedBest;
  for (let d = 1; d <= LAST_DAY; d++) {
    const has = !!(f["d" + d + "pts"] || f["d" + d + "rank"] || f["d" + d + "sec"]);
    const p = fieldPts(f["d" + d + "pts"]);
    const rk = (f["d" + d + "rank"] && f["d" + d + "rank"].stringValue) || "";
    if (!has && !p) continue;
    if (d > level) level = d;
    if (p > 0) total += p;
    const sec = Number((f["d" + d + "sec"] && f["d" + d + "sec"].integerValue) || 0);
    dayScores[d] = { pts: p, seconds: sec, rank: rk };
    if (betterRun({ pts: p, seconds: sec }, { pts, seconds })) {
      pts = p;
      // keep prior clock if this day has score but no recorded time
      seconds = sec > 0 ? sec : (p > 0 && seconds > 0 ? seconds : sec);
      rank = rk || rank;
      day = d;
    } else if (!rank && rk) {
      rank = rk;
    }
  }
  if (!level) level = Number(base.level || day || 0);
  if (!total) total = pts;
  return { ...base, pts, seconds, rank, day, level, total, dayScores };
}

/* highest PTS per hand. faster time breaks a tie. */
function uniqueBest(rows, byDay = false) {
  const map = new Map();
  for (const r of rows) {
    if (!r) continue;
    const k = handKey(r.name, r.local, r.who) + (byDay ? "|" + (r.day || 1) : "");
    const prev = map.get(k);
    if (!prev || betterRun(r, prev)) map.set(k, r);
  }
  return [...map.values()].sort((a, b) => b.pts - a.pts || (a.seconds || 9e9) - (b.seconds || 9e9));
}

function emptyCrew(name, local, who) {
  return {
    name,
    local: local || "",
    who,
    pts: 0,
    seconds: 0,
    rank: "",
    day: 0,
    level: 0,
    total: 0,
  };
}

/* merge best run per name+crew */
function careerBest(rows) {
  const map = new Map();
  for (const r of rows) {
    if (!r || !r.name) continue;
    const k = handKey(r.name, r.local, r.who);
    const level = Math.max(r.level || r.day || 0, 0);
    const prev = map.get(k);
    if (!prev) {
      map.set(k, { ...r, level, who: r.who === "tremont" ? "tremont" : "utah" });
      continue;
    }
    const keep = betterRun(r, prev) ? r : prev;
    map.set(k, {
      ...keep,
      who: keep.who === "tremont" ? "tremont" : "utah",
      level: Math.max(prev.level || prev.day || 0, level),
      local: keep.local || prev.local || r.local || "",
      rank: keep.rank || prev.rank || r.rank || "",
      total: Math.max(ptsNum(keep.total), ptsNum(prev.total), ptsNum(keep.pts), ptsNum(prev.pts)),
    });
  }
  return [...map.values()].sort((a, b) => b.pts - a.pts || (a.seconds || 9e9) - (b.seconds || 9e9));
}

/* every hand gets BOTH crews on the board — zeros until that traveler plays */
function crewSlots(rows) {
  const people = new Map();
  for (const r of careerBest(rows)) {
    const pk = careerKey(r.name, r.local);
    let p = people.get(pk);
    if (!p) {
      p = { name: r.name, local: r.local || "", utah: null, tremont: null };
      people.set(pk, p);
    }
    const who = r.who === "tremont" ? "tremont" : "utah";
    p[who] = r;
    if (r.local) p.local = r.local;
  }
  const list = [...people.values()].sort((a, b) => {
    const ap = Math.max(a.utah?.pts || 0, a.tremont?.pts || 0);
    const bp = Math.max(b.utah?.pts || 0, b.tremont?.pts || 0);
    if (bp !== ap) return bp - ap;
    return String(a.name).localeCompare(String(b.name));
  });
  const out = [];
  for (const p of list) {
    out.push(p.utah || emptyCrew(p.name, p.local, "utah"));
    out.push(p.tremont || emptyCrew(p.name, p.local, "tremont"));
  }
  return out;
}

async function fsQuery(collectionId, limit) {
  async function run(order) {
    const q = {
      structuredQuery: {
        from: [{ collectionId }],
        limit,
      },
    };
    if (order) q.structuredQuery.orderBy = [{ field: { fieldPath: "pts" }, direction: "DESCENDING" }];
    const r = await fsFetch(`${FS_DOCS}:runQuery?key=${FS_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(q),
    });
    if (!r.ok) throw new Error("query " + r.status);
    const rows = await r.json();
    const out = [];
    for (const e of rows) {
      if (e.error) throw new Error("query " + (e.error.code || "err"));
      if (!e.document || !e.document.fields) continue;
      if (collectionId === "hands") {
        const id = String(e.document.name || "").split("/").pop() || "";
        const row = parseHandCareer(e.document.fields, id);
        if (row) out.push(row);
      } else {
        const row = parseScoreFields(e.document.fields);
        if (row) out.push(row);
      }
    }
    return out;
  }
  // Never depend on a pts index — pull every hand, sort on the phone so every
  // box sees the same full cloud set.
  const rows = await run(false);
  rows.sort((a, b) => (b.pts || 0) - (a.pts || 0) || (a.seconds || 9e9) - (b.seconds || 9e9));
  return rows;
}

function loadCachedBoard() {
  try {
    const rows = JSON.parse(localStorage.getItem(BOARD_CACHE) || "[]");
    return Array.isArray(rows) ? rows : [];
  } catch (_) {
    return [];
  }
}

function saveCachedBoard(rows) {
  try {
    localStorage.setItem(BOARD_CACHE, JSON.stringify((rows || []).slice(0, 80)));
  } catch (_) {}
}

function loadPending() {
  try {
    const rows = JSON.parse(localStorage.getItem(BOARD_PENDING) || "[]");
    return Array.isArray(rows) ? rows : [];
  } catch (_) {
    return [];
  }
}

function savePending(rows) {
  try {
    localStorage.setItem(BOARD_PENDING, JSON.stringify(rows.slice(0, 40)));
  } catch (_) {}
}

function queuePending(rec) {
  const rows = loadPending();
  rows.push(rec);
  savePending(uniqueBest(rows, true));
}

function unqueuePending(rec) {
  const k = handKey(rec.name, rec.local, rec.who) + "|" + (rec.day || 1);
  savePending(loadPending().filter((r) => handKey(r.name, r.local, r.who) + "|" + (r.day || 1) !== k));
}

function localBestRows() {
  const out = [];
  let name = "";
  let local = "";
  try {
    name = (durableGet("lw_name") || "").trim().toUpperCase();
    local = (durableGet("lw_local") || "").trim().toUpperCase();
  } catch (_) {}
  if (!name) name = commitHand(false) || "";
  if (!name) return out;
  for (const who of ["utah", "tremont"]) {
    for (let d = 1; d <= LAST_DAY; d++) {
      const b = loadBest(d, who);
      if (!b || !b.watts) continue;
      out.push({
        name,
        local,
        who,
        pts: Number(b.watts) || 0,
        seconds: bestSecondsOf(b),
        rank: b.rank || "",
        day: d,
        level: d,
      });
    }
  }
  return out;
}

let boardFetchedAt = 0;
const BOARD_TTL_MS = 8 * 1000; // short — every phone should see the same cloud pull

function invalidateBoard() {
  boardFetchedAt = 0;
  boardCloudOk = false;
}

async function fetchBoard(force) {
  boardNote = "";
  const fresh = !force && boardCloudOk && Date.now() - boardFetchedAt < BOARD_TTL_MS;
  let cloud = [];
  let cloudOk = false;
  if (fresh) {
    cloud = loadCachedBoard();
    cloudOk = cloud.length > 0;
  } else {
    try {
      cloud = await fsQuery("hands", 200);
      cloudOk = true;
      boardFetchedAt = Date.now();
    } catch (err) {
      if ((err && err.status === 429) || fsLastStatus === 429 || fsCooling()) {
        boardNote = "Gate's jammed — last cloud pull only.";
      }
    }
  }
  if (cloudOk) {
    saveCachedBoard(cloud);
    boardCloudOk = true;
    if (!boardNote) boardNote = "";
  } else if (fsLastStatus === 429 || fsCooling()) {
    boardNote = "Gate's jammed — last cloud pull only.";
  }
  // DISPLAY IS CLOUD ONLY. Never mix this phone's local bests/pending into the board.
  const cached = cloudOk ? cloud : loadCachedBoard();
  if (!cached.length) {
    if (fsLastStatus === 429 || fsCooling()) boardNote = "Gate's jammed. Board is cloud-only — try again in a minute.";
  }
  const slotted = crewSlots(cached);
  try {
    const names = new Set();
    for (const r of slotted) {
      const n = String(r && r.name || "").trim().toUpperCase();
      if (n) names.add(n);
    }
    if (names.size) {
      net.handsKnown = Math.max(net.handsKnown | 0, names.size);
      if ((net.plays | 0) < names.size) net.plays = names.size;
      savePlaysCache(Math.max(loadPlaysCache(), net.plays));
      paintSitePulse();
    }
  } catch (_) {}
  return slotted;
}

function scoreFields(rec, prevFields) {
  const prev = parseScoreFields(prevFields) || { pts: 0, seconds: 0, rank: "", day: rec.day, who: rec.who, level: 0 };
  const days = {};
  for (let d = 1; d <= LAST_DAY; d++) {
    const has = !!(prevFields && (prevFields["d" + d + "pts"] || prevFields["d" + d + "rank"]));
    const pts = fieldPts(prevFields && prevFields["d" + d + "pts"]);
    const rk = (prevFields && prevFields["d" + d + "rank"] && prevFields["d" + d + "rank"].stringValue) || "";
    if (!has && !pts) continue;
    days[d] = {
      pts,
      seconds: Number((prevFields["d" + d + "sec"] && prevFields["d" + d + "sec"].integerValue) || 0),
      rank: rk,
    };
  }
  const firstWrite = !prevFields;
  const dayPrev = days[rec.day];
  const betterOverall = betterRun(rec, prev);
  const betterDay = !dayPrev || betterRun(rec, dayPrev);
  const recLevel = Math.max(rec.day || 1, rec.level || 1);
  const prevLevel = Math.max(prev.level || prev.day || 0, ...Object.keys(days).map(Number), 0);
  const levelUp = recLevel > prevLevel;
  if (!firstWrite && !betterOverall && !betterDay && !levelUp && !rec.started) return null;
  let overall;
  if (betterOverall || firstWrite) {
    overall = {
      ...rec,
      seconds: (rec.seconds | 0) > 0 ? (rec.seconds | 0) : (prev.seconds | 0),
      rank: rec.rank || prev.rank || "",
    };
  } else {
    overall = {
      ...prev,
      name: rec.name,
      local: rec.local,
      who: rec.who,
      seconds: (prev.seconds | 0) > 0 ? (prev.seconds | 0) : (rec.seconds | 0),
      rank: prev.rank || rec.rank || "",
    };
  }
  if (!overall.rank) overall.rank = rec.rank || prev.rank || "";
  if (betterDay || !dayPrev) {
    const keepSec = (rec.seconds | 0) > 0 ? (rec.seconds | 0) : (dayPrev && dayPrev.seconds) || 0;
    days[rec.day] = {
      pts: ptsNum(rec.pts),
      seconds: keepSec,
      rank: rec.rank || (dayPrev && dayPrev.rank) || "",
    };
  } else {
    days[rec.day] = dayPrev;
  }
  // Recompute overall from day map so top-level seconds always match the best-score day
  {
    let best = { pts: ptsNum(overall.pts), seconds: overall.seconds | 0, rank: overall.rank || "", day: overall.day || rec.day || 1 };
    for (const [d, v] of Object.entries(days)) {
      if (!v) continue;
      if (betterRun(v, best)) {
        best = { pts: ptsNum(v.pts), seconds: v.seconds | 0, rank: v.rank || best.rank, day: Number(d) };
      }
    }
    overall.pts = ptsNum(best.pts);
    overall.seconds = best.seconds > 0 ? best.seconds : (overall.seconds | 0);
    overall.rank = best.rank || overall.rank;
    overall.day = best.day;
  }
  const fields = {
    name: { stringValue: rec.name },
    local: { stringValue: rec.local || "" },
    who: { stringValue: rec.who === "tremont" ? "tremont" : "utah" },
    pts: { integerValue: String(ptsNum(overall.pts)) },
    seconds: { integerValue: String(Math.max(0, overall.seconds | 0)) },
    rank: { stringValue: overall.rank || "" },
    day: { integerValue: String(overall.day || rec.day || 1) },
    bestDay: { integerValue: String(Math.max(rec.day || 1, rec.level || 1, Number((prevFields && prevFields.bestDay && prevFields.bestDay.integerValue) || 0), ...Object.keys(days).map(Number))) },
    ts: { timestampValue: new Date().toISOString() },
  };
  for (const [d, v] of Object.entries(days)) {
    if (!v) continue;
    fields["d" + d + "pts"] = { integerValue: String(ptsNum(v.pts)) };
    fields["d" + d + "sec"] = { integerValue: String(Math.max(0, v.seconds | 0)) };
    fields["d" + d + "rank"] = { stringValue: v.rank || "" };
  }
  return fields;
}

function cloudNeedsWrite(fields, prevFields) {
  if (!fields) return false;
  if (!prevFields) return true;
  if (fieldPts(fields.pts) > fieldPts(prevFields.pts)) return true;
  const nextBest = Number((fields.bestDay && fields.bestDay.integerValue) || 0);
  const prevBest = Number((prevFields.bestDay && prevFields.bestDay.integerValue) || 0);
  if (nextBest > prevBest) return true;
  for (let d = 1; d <= LAST_DAY; d++) {
    const pk = "d" + d + "pts";
    const rk = "d" + d + "rank";
    const sk = "d" + d + "sec";
    if (fields[pk] && !prevFields[pk]) return true;
    if (fields[rk] && !(prevFields[rk] && prevFields[rk].stringValue) && fields[rk].stringValue) return true;
    if (fieldPts(fields[pk]) > fieldPts(prevFields[pk])) return true;
    const ns = Number((fields[sk] && fields[sk].integerValue) || 0);
    const ps = Number((prevFields[sk] && prevFields[sk].integerValue) || 0);
    if (ns > 0 && (ps <= 0 || ns < ps) && fieldPts(fields[pk]) >= fieldPts(prevFields[pk])) return true;
  }
  const np = fieldPts(fields.pts);
  const pp = fieldPts(prevFields.pts);
  if (np === pp && np > 0) {
    const ns = Number((fields.seconds && fields.seconds.integerValue) || 0);
    const ps = Number((prevFields.seconds && prevFields.seconds.integerValue) || 0);
    if (ns > 0 && (ps <= 0 || ns < ps)) return true;
  }
  const nr = (fields.rank && fields.rank.stringValue) || "";
  const pr = (prevFields.rank && prevFields.rank.stringValue) || "";
  if (nr && nr !== pr && nr !== "ON SITE") return true;
  return false;
}

async function postScore(rec) {
  const started = !!rec.started;
  rec = {
    name: rec.name,
    local: rec.local || "",
    pts: ptsNum(rec.pts),
    seconds: rec.seconds | 0,
    rank: rec.rank || "",
    day: rec.day || 1,
    level: rec.level || rec.day || 1,
    who: rec.who === "tremont" ? "tremont" : "utah",
    started,
  };
  queuePending(rec);

  const id = handId(rec.name, rec.local, rec.who);
  const url = `${FS_DOCS}/hands/${encodeURIComponent(id)}?key=${FS_KEY}`;
  const mask = (fields) =>
    Object.keys(fields)
      .map((k) => "updateMask.fieldPaths=" + encodeURIComponent(k))
      .join("&");

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const g = await fsFetch(url, undefined, true);
      let prevFields = null;
      if (g.ok) {
        const doc = await g.json();
        prevFields = doc.fields || null;
      } else if (g.status === 404) {
        prevFields = null;
      } else {
        await new Promise((ok) => setTimeout(ok, 280 * (attempt + 1)));
        continue;
      }
      const fields = scoreFields(rec, prevFields);
      if (!fields) {
        unqueuePending(rec);
        return { kept: true };
      }
      if (prevFields && !cloudNeedsWrite(fields, prevFields)) {
        unqueuePending(rec);
        return { kept: true };
      }
      // Never lower the overall high score in the payload itself
      if (prevFields && fieldPts(fields.pts) < fieldPts(prevFields.pts)) {
        fields.pts = prevFields.pts;
        if (prevFields.seconds) fields.seconds = prevFields.seconds;
      }
      const r = await fsFetch(url + "&" + mask(fields), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
      }, true);
      if (!r.ok) {
        await new Promise((ok) => setTimeout(ok, 280 * (attempt + 1)));
        continue;
      }
      const v = await fsFetch(url, undefined, true);
      if (v.ok) {
        const doc = await v.json();
        const got = fieldPts(doc.fields && doc.fields.pts);
        const gotBest = Number((doc.fields && doc.fields.bestDay && doc.fields.bestDay.integerValue) || 0);
        const wantBest = Number((fields.bestDay && fields.bestDay.integerValue) || rec.level || rec.day || 0);
        if (got >= fieldPts(fields.pts) && gotBest >= Math.min(wantBest, LAST_DAY)) {
          unqueuePending(rec);
          invalidateBoard();
          return { kept: false, pts: got, level: gotBest };
        }
      }
    } catch (_) {}
    await new Promise((ok) => setTimeout(ok, 280 * (attempt + 1)));
  }
  return { kept: false, local: true, down: true };
}

async function flushPending() {
  if (flushing || fsCooling()) return;
  flushing = true;
  try {
    const rows = loadPending();
    for (const rec of rows) {
      try {
        await postScore(rec);
      } catch (_) {}
    }
  } finally {
    flushing = false;
  }
}

function levelNum(r) {
  const n = Math.max(
    Number(r.level) || 0,
    Number(r.bestDay) || 0,
    Number(r.day) || 0
  );
  if (!n) return 0;
  return Math.max(0, Math.min(LAST_DAY, n));
}

function rankShort(rank) {
  const r = String(rank || "").toUpperCase();
  if (!r) return "—";
  if (r.includes("TOP")) return "TOP HAND";
  if (r.includes("LEAD")) return "LEADMAN";
  if (r.includes("JOURNEY")) return "JOURNEYMAN";
  if (r.includes("APPRENT")) return "APPRENTICE";
  if (r.includes("RED")) return "RED TAG";
  if (r.includes("SITE") || r.includes("WALK")) return "ON SITE";
  if (r === "OT" || r.includes("LAYOFF")) return "OT";
  if (r.includes("SLIP")) return "SLIP";
  return r;
}

/* Full career row: name, local, crew, highest level, best score, time, rank title */
function renderBoard(el, rows) {
  el.textContent = "";
  if (boardNote) {
    const n = document.createElement("div");
    n.className = "board-note";
    n.textContent = boardNote;
    el.appendChild(n);
  }
  if (!rows.length) {
    const d = document.createElement("div");
    d.className = "board-note";
    d.textContent = boardNote
      ? "No names on this box yet. Land a loop and you're on it."
      : "Board's empty. First loop landed takes the top slot.";
    el.appendChild(d);
    return;
  }
  const compact = el.id === "title-board" || el.id === "board-mini";
  const hdr = document.createElement("div");
  hdr.className = "board-row hdr";
  const cols = compact
    ? [
        ["b-pos", "#"],
        ["b-name", "NAME"],
        ["b-who", "CREW"],
        ["b-lvl", "LVL"],
        ["b-pts", "BEST"],
        ["b-time", "TIME"],
        ["b-rank", "RANK"],
      ]
    : [
        ["b-pos", "#"],
        ["b-name", "NAME"],
        ["b-local", "LOCAL"],
        ["b-who", "CREW"],
        ["b-lvl", "LVL"],
        ["b-pts", "BEST"],
        ["b-tot", "TOTAL"],
        ["b-time", "TIME"],
        ["b-rank", "RANK"],
      ];
  for (const [cls, txt] of cols) {
    const s = document.createElement("span");
    s.className = cls;
    s.textContent = txt;
    hdr.appendChild(s);
  }
  el.appendChild(hdr);
  rows.forEach((r, i) => {
    const row = document.createElement("div");
    row.className = "board-row" + (i === 0 ? " lead" : "");
    const pos = document.createElement("span");
    pos.className = "b-pos";
    pos.textContent = String(i + 1);

    const name = document.createElement("span");
    name.className = "b-name";
    name.textContent = r.name || "?";
    if (compact && r.local) {
      const loc = document.createElement("span");
      loc.className = "b-loc";
      loc.textContent = r.local;
      name.appendChild(loc);
    }

    const kids = [pos, name];
    if (!compact) {
      const local = document.createElement("span");
      local.className = "b-local";
      local.textContent = r.local || "—";
      kids.push(local);
    }

    const who = document.createElement("span");
    who.className = "b-who" + (r.who === "tremont" ? " trem" : "");
    who.textContent = travelerTag(r.who);
    kids.push(who);

    const lvl = document.createElement("span");
    const played = (r.pts || 0) > 0 || (r.seconds || 0) > 0 || !!(r.rank && r.rank !== "—");
    lvl.className = "b-lvl";
    lvl.textContent = played || levelNum(r) > 0 ? String(levelNum(r)) : "—";
    kids.push(lvl);

    const pts = document.createElement("span");
    pts.className = "b-pts";
    pts.textContent = played ? ptsNum(r.pts).toLocaleString() : "—";
    kids.push(pts);

    if (!compact) {
      const tot = document.createElement("span");
      tot.className = "b-tot";
      const tpts = ptsNum(r.total) || ptsNum(r.pts);
      tot.textContent = played ? tpts.toLocaleString() : "—";
      kids.push(tot);
    }

    const time = document.createElement("span");
    time.className = "b-time";
    time.textContent = boardTimeText(r);
    kids.push(time);

    const rank = document.createElement("span");
    rank.className = "b-rank";
    rank.textContent = rankShort(r.rank);
    rank.title = String(r.rank || "");
    kids.push(rank);

    row.append(...kids);
    el.appendChild(row);
  });
}

/* ------------------------------------------------------------------ */
/*  STATE                                                              */
/* ------------------------------------------------------------------ */
const state = {
  mode: "title",
  time: SHIFT,
  overtime: 0,
  watts: 0,
  hp: 3,
  shocks: 0,
  combo: 0,
  hasTools: false,
  speedBoost: 0,
  progress: Object.fromEntries(JOBS.map((j) => [j.id, 0])),
  done: Object.fromEntries(JOBS.map((j) => [j.id, false])),
  interactables: [],
  colliders: [],
  wet: [],
  sparks: [],
  racks: [],
  crew: [],
  lifts: [],
  strobes: [],
  smokes: [],
  faLive: false,
  faHorns: 0,
  forklift: null,
  utvs: [],
  ramps: [],
  craneHook: null,
  nearest: null,
  built: false,
};

/* ------------------------------------------------------------------ */
/*  THREE SETUP                                                        */
/* ------------------------------------------------------------------ */
const renderer = (() => {
  try {
    return new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
  } catch (err) {
    console.warn("[LW] falling back to low-power GL", err);
    return new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "low-power" });
  }
})();
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8ea0ad);
scene.fog = new THREE.Fog(0x8ea0ad, 70, 520);

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 560);
const cam = { yaw: 0, pitch: -0.28, dist: 3.7 };

const clock = new THREE.Clock();
const loader = new THREE.TextureLoader();

const mats = {};
const tmp = {
  v: new THREE.Vector3(),
  f: new THREE.Vector3(),
  r: new THREE.Vector3(),
};

/* ------------------------------------------------------------------ */
/*  INPUT                                                              */
/* ------------------------------------------------------------------ */
const keys = Object.create(null);
const stick = { x: 0, y: 0, active: false };
const look = { dragging: false, lx: 0, ly: 0, id: null };
let holdSprint = false;

let coarse = matchMedia("(pointer: coarse)").matches || innerWidth < 820;
function isCoarse() {
  return coarse;
}
function updateCoarse() {
  coarse = matchMedia("(pointer: coarse)").matches || innerWidth < 820;
  // keep the touch layer in lockstep so a desktop resize can't leave an
  // invisible joystick eating left-half drags (or strand a phone without one)
  if (state.mode !== "title") $("touch").classList.toggle("hidden", !coarse);
}

/* the walk zone (floating-stick spawn area); mirrored when thumbs are swapped */
function inWalkZone(e) {
  return settings.swap ? e.clientX > innerWidth * 0.58 : e.clientX < innerWidth * 0.42;
}

function typingInField(el) {
  if (!el) return false;
  const tag = (el.tagName || "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return !!(el.closest && el.closest("input, textarea, select, [contenteditable='true']"));
}
function overlayOpen() {
  for (const id of ["shop-screen", "chat-dock", "board-screen"]) {
    const n = document.getElementById(id);
    if (n && !n.classList.contains("hidden")) return true;
  }
  return false;
}

addEventListener("keydown", (e) => {
  if (typingInField(e.target) || overlayOpen()) return; // iPhone ADD TO THE GAME needs Space
  if (e.repeat) return; // OS key-repeat must not spam interact/jump
  keys[e.code] = true;
  if (state.mode === "play" && ["Space", "Tab"].includes(e.code)) e.preventDefault();
  if (e.code === "KeyE" || e.code === "Enter") tryInteract();
  if (e.code === "Space") jump();
  if (e.code === "KeyT") openChat();
  if (e.code === "KeyV") sendWave();
});
addEventListener("keyup", (e) => {
  // always clear — swallowing a keyup while an overlay has focus leaves the key stuck down
  keys[e.code] = false;
});

/* focus loss must never leave a key or held button stuck down */
function resetTransientInput() {
  for (const k in keys) keys[k] = false;
  holdSprint = false;
  look.dragging = false;
  dayState.liftUp = false;
  dayState.liftDn = false;
}
addEventListener("blur", resetTransientInput);

canvas.addEventListener("mousedown", (e) => {
  if (state.mode !== "play") return;
  if (e.button === 0 && !isCoarse()) {
    canvas.requestPointerLock?.();
  }
});
addEventListener("mousemove", (e) => {
  if (state.mode !== "play") return;
  if (document.pointerLockElement === canvas) {
    cam.yaw -= e.movementX * 0.0032 * settings.sens;
    cam.pitch -= e.movementY * 0.0024 * settings.sens;
    cam.pitch = THREE.MathUtils.clamp(cam.pitch, -0.7, 0.35);
  }
});

/* joystick — fixed pad plus floating spawn anywhere in the walk zone */
const stickCtl = (() => {
  const root = $("stick");
  const knob = $("stick-knob");
  const max = 38;
  const dead = 0.15;
  let pid = null;
  let cx = 0;
  let cy = 0;

  function setFromEvent(e) {
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const m = Math.hypot(dx, dy) || 1;
    const cl = Math.min(m, max);
    let v = cl / max;
    v = v < dead ? 0 : (v - dead) / (1 - dead);
    stick.x = (dx / m) * v;
    stick.y = (dy / m) * v;
    knob.style.transform = `translate(${(dx / m) * cl}px, ${(dy / m) * cl}px)`;
  }

  function begin(e, capEl) {
    pid = e.pointerId;
    stick.active = true;
    root.classList.remove("idle");
    try {
      capEl.setPointerCapture?.(e.pointerId);
    } catch (_) {}
    setFromEvent(e);
  }

  function startFixed(e) {
    if (pid !== null) return;
    const r = $("stick-base").getBoundingClientRect();
    cx = r.left + r.width / 2;
    cy = r.top + r.height / 2;
    begin(e, root);
  }

  function startFloating(e) {
    if (pid !== null) return;
    cx = e.clientX;
    cy = e.clientY;
    root.classList.add("floating");
    root.style.left = cx - 60 + "px";
    root.style.top = cy - 60 + "px";
    begin(e, canvas);
  }

  function move(e) {
    if (e.pointerId === pid) setFromEvent(e);
  }

  function end(e) {
    if (e.pointerId !== pid) return;
    pid = null;
    stick.active = false;
    stick.x = 0;
    stick.y = 0;
    knob.style.transform = "";
    root.classList.remove("floating");
    root.classList.add("idle");
    root.style.left = "";
    root.style.top = "";
  }

  root.addEventListener("pointerdown", (e) => {
    recoverAudio();
    startFixed(e);
    e.preventDefault();
  });
  root.addEventListener("pointermove", move);
  root.addEventListener("pointerup", end);
  root.addEventListener("pointercancel", end);

  return { startFloating, move, end };
})();

function bindLookSurface() {
  const el = canvas;
  el.addEventListener("pointerdown", (e) => {
    if (state.mode === "play") e.preventDefault();
    recoverAudio();
    if (state.mode !== "play") return;
    if (e.target.closest && e.target.closest("#touch button, #stick")) return;
    if (isCoarse() && inWalkZone(e)) {
      stickCtl.startFloating(e);
      return;
    }
    if (look.dragging) return; // a second finger must not steal the drag
    look.dragging = true;
    look.lx = e.clientX;
    look.ly = e.clientY;
    look.id = e.pointerId;
    try {
      el.setPointerCapture?.(e.pointerId);
    } catch (_) {}
  });
  el.addEventListener("pointermove", (e) => {
    stickCtl.move(e);
    if (!look.dragging || e.pointerId !== look.id) return;
    const dx = e.clientX - look.lx;
    const dy = e.clientY - look.ly;
    look.lx = e.clientX;
    look.ly = e.clientY;
    cam.yaw -= dx * 0.007 * settings.sens;
    cam.pitch -= dy * 0.005 * settings.sens;
    cam.pitch = THREE.MathUtils.clamp(cam.pitch, -0.7, 0.35);
  });
  const end = (e) => {
    stickCtl.end(e);
    if (e.pointerId === look.id) look.dragging = false;
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
}
bindLookSurface();

/* boot: tap to jump, keep holding to hustle */
(() => {
  const b = $("btn-jump");
  let holdTimer = 0;
  const release = (e) => {
    clearTimeout(holdTimer);
    holdSprint = false;
    if (e) b.releasePointerCapture?.(e.pointerId);
  };
  b.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    recoverAudio();
    jump();
    b.setPointerCapture?.(e.pointerId);
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => {
      holdSprint = true;
    }, 230);
  });
  b.addEventListener("pointerup", release);
  b.addEventListener("pointercancel", release);
})();

$("btn-act").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  recoverAudio();
  tryInteract();
});

/* the scissor's ▲▼ — only up while Utah's behind the wheel on a phone */
for (const [id, flag] of [
  ["btn-lift-up", "liftUp"],
  ["btn-lift-dn", "liftDn"],
]) {
  const b = $(id);
  const off = (e) => {
    dayState[flag] = false;
    if (e) b.releasePointerCapture?.(e.pointerId);
  };
  b.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    recoverAudio();
    dayState[flag] = true;
    b.setPointerCapture?.(e.pointerId);
  });
  b.addEventListener("pointerup", off);
  b.addEventListener("pointercancel", off);
}

/* viewport sizing — hardened for mobile rotation and browser-chrome resizes.
   In portrait, derive the vertical FOV from a ~70° horizontal target so the
   player is not looking through a keyhole. */
const VP_LOCK =
  "width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover, shrink-to-fit=no";

function viewportMeta() {
  return document.querySelector('meta[name="viewport"]');
}

/* iOS Safari still pinch-zooms a two-thumb canvas game. Once scale ≠ 1 the
   page is cropped, touches miss the sticks, and you can't pinch back out
   because the game owns the gestures — force the meta tag back to 1x. */
function unzoomIfNeeded() {
  const ae = document.activeElement;
  if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return false;
  const vv = window.visualViewport;
  if (!vv || Math.abs(vv.scale - 1) < 0.02) return false;
  const meta = viewportMeta();
  if (meta) {
    meta.setAttribute("content", "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no");
    meta.setAttribute("content", VP_LOCK);
  }
  try {
    window.scrollTo(0, 0);
  } catch (_) {}
  return true;
}

function applySize() {
  unzoomIfNeeded();
  const w = innerWidth;
  const h = innerHeight;
  camera.aspect = w / h;
  camera.fov =
    camera.aspect < 1
      ? Math.min(
          100,
          THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(70) / 2) / camera.aspect))
        )
      : 62;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  updateCoarse();
  // a fine↔coarse flip mid-drive must not strand the lift ▲▼ buttons
  if (window.LW) syncLiftBtns();
  // setSize clears the buffer; repaint if the loop isn't rendering right now
  if (state.built && state.mode !== "play" && state.mode !== "end") renderer.render(scene, camera);
}

function lockIosZoom() {
  const kill = (e) => e.preventDefault();
  for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
    document.addEventListener(type, kill, { capture: true, passive: false });
  }
  // two thumbs on a twin-stick is a pinch as far as Safari is concerned
  document.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches && e.touches.length > 1) {
        e.preventDefault();
        return;
      }
      if (typingInField(e.target) || overlayOpen()) return;
      if (state.mode === "play") e.preventDefault();
    },
    { passive: false, capture: true }
  );
  let lastTap = 0;
  document.addEventListener(
    "touchend",
    (e) => {
      const now = performance.now();
      const dt = now - lastTap;
      lastTap = now;
      if (dt > 0 && dt < 300 && (!e.touches || e.touches.length === 0)) {
        const t = e.target;
        const ok =
          t &&
          t.closest &&
          t.closest("button, input, textarea, select, a, label, [role=button], .day-chip, .fa-chip, .fa-key, .tr-row, .wire-board, .col, .shop-att-btn");
        if (!ok) e.preventDefault();
      }
      if (window.visualViewport && Math.abs(window.visualViewport.scale - 1) > 0.02) {
        unzoomIfNeeded();
        applySize();
      }
    },
    { passive: false, capture: true }
  );
}

addEventListener("resize", applySize);
addEventListener("orientationchange", () => {
  applySize();
  setTimeout(applySize, 300); // iOS reports stale dimensions at rotation time
});
window.visualViewport?.addEventListener("resize", applySize);
window.visualViewport?.addEventListener("scroll", () => {
  if (unzoomIfNeeded()) applySize();
});
lockIosZoom();
applySize();
document.addEventListener("focusout", () => {
  setTimeout(() => {
    unzoomIfNeeded();
    applySize();
  }, 80);
});

/* ------------------------------------------------------------------ */
/*  HELPERS                                                            */
/* ------------------------------------------------------------------ */
function loadTex(url, repeatX = 1, repeatY = 1) {
  return new Promise((res) => {
    loader.load(
      url,
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(repeatX, repeatY);
        t.anisotropy = 8;
        res(t);
      },
      undefined,
      () => res(null)
    );
  });
}

function toastMutter(text) {
  const box = $("toasts");
  if (!box) return;
  const el = document.createElement("div");
  el.className = "toast mutter";
  el.textContent = travelerName().toUpperCase() + ": " + text;
  box.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

function toast(text, bad = false) {
  const box = $("toasts");
  if (!box) return;
  const el = document.createElement("div");
  el.className = "toast" + (bad ? " bad" : "");
  el.textContent = text;
  box.appendChild(el);
  setTimeout(() => el.remove(), 1500);
}

let radioTimer = 0;
const tts = { voices: [], ready: false };

function bootTTS() {
  if (!window.speechSynthesis) return;
  const grab = () => {
    tts.voices = speechSynthesis.getVoices().filter((v) => /en/i.test(v.lang));
    tts.ready = tts.voices.length > 0;
  };
  grab();
  if (!tts.bound) {
    tts.bound = true;
    speechSynthesis.addEventListener("voiceschanged", grab);
  }
}

/* one distinct voice per character when the device has several; when a
   phone only ships one english voice, pitch/rate separation carries it */
function rosterVoice(role) {
  const vs = tts.voices;
  if (!vs.length) return null;
  const male = /male|david|mark|guy|ryan|tony|andrew|james|christopher|fred|daniel|arthur|aaron|alex|oliver|rishi/i;
  const score = (v) => (male.test(v.name) ? 0 : 2) + (v.localService ? 0 : 1);
  const pool = [...vs].sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name));
  const idx = { lugo: 0, lemon: 5, drew: 1, utah: 2, tremont: 2, crew: 3, joe: 4, chris: 1, don: 3 }[role] || 0;
  return pool[idx % pool.length];
}

/* Unlock speech synthesis while a user-gesture activation is still live
   (iOS silently drops speech queued outside a gesture). */
function primeTTS() {
  if (!window.speechSynthesis) return;
  try {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    speechSynthesis.speak(u);
  } catch (_) {}
}

/* baked xAI neural MP3s so every character has a real voice.
   map.json is {role, text, file}[] — speakAs looks up role|text exactly */

const voice = { map: null, el: null, src: null, buf: new Map() };

function loadVoicePack() {
  if (voice._loading) return voice._loading;
  voice._loading = fetch("/assets/voice/map.json?v=120")
    .then((r) => (r.ok ? r.json() : null))
    .then((rows) => {
      if (!Array.isArray(rows)) {
        voice._loading = null;
        return;
      }
      voice.map = Object.create(null);
      for (const e of rows) {
        if (e && e.role && e.text && e.file) voice.map[e.role + "|" + e.text] = e.file;
      }
      if (voice.pending) {
        const p = voice.pending;
        voice.pending = null;
        speakAs(p.role, p.text);
      }
    })
    .catch(() => {
      voice._loading = null;
    });
  return voice._loading;
}
loadVoicePack();

function stopVoice() {
  voice.gen = (voice.gen || 0) + 1; // cancel clips still in flight
  try {
    voice.src?.stop();
  } catch (_) {}
  voice.src = null;
  try {
    if (voice.el) voice.el.pause();
  } catch (_) {}
  if (window.speechSynthesis) speechSynthesis.cancel();
}

/* clips play through the same AudioContext the SFX already unlocked
   on GET YOUR POUCH — that's what actually works on a phone */
function primeVoice() {
  primeTTS();
}

function prefetchLine(role, text) {
  const url = voice.map && voice.map[role + "|" + text];
  if (!url || !audio.ctx || voice.buf.has(url)) return;
  fetch(url)
    .then((r) => r.arrayBuffer())
    .then((ab) => audio.ctx.decodeAudioData(ab.slice(0)))
    .then((buf) => voice.buf.set(url, loudnessFix(buf)))
    .catch(() => {});
}

function playClip(url, role, text) {
  ensureAudio();
  recoverAudio();
  const gen = (voice.gen = (voice.gen || 0) + 1); // stopVoice bumps this — stale async starts are dropped
  const start = (buf) => {
    if (gen !== voice.gen) return;
    if (state.mode === "pause" || state.mode === "title") return; // a late clip must not talk over menus
    try {
      voice.src?.stop();
    } catch (_) {}
    const src = audio.ctx.createBufferSource();
    src.buffer = loudnessFix(buf);
    src.connect(ensureVoiceBus());
    src.start();
    voice.src = src;
  };
  const cached = voice.buf.get(url);
  if (cached) {
    start(cached);
    return;
  }
  fetch(url)
    .then((r) => r.arrayBuffer())
    .then((ab) => audio.ctx.decodeAudioData(ab.slice(0)))
    .then((buf) => {
      voice.buf.set(url, loudnessFix(buf));
      if (voice.buf.size > 48) voice.buf.delete(voice.buf.keys().next().value); // cap decoded PCM
      start(buf);
    })
    .catch(() => {
      // clip miss stays silent — browser TTS is the "robot radio" the hall hates
      if (gen !== voice.gen) return;
    });
}

function speakTTS(role, text) {
  if (!window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(text);
  u.volume = 1;
  let delay = 0;
  if (role === "lugo") {
    delay = 60; // iOS drops an utterance queued in the same tick as cancel()
    u.pitch = 0.62; // Texas gravel
    u.rate = 0.9;
  } else if (role === "drew") {
    delay = 60;
    u.pitch = 0.8; // slow, carrying paperwork
    u.rate = 0.82;
  } else if (role === "don") {
    delay = 60;
    u.pitch = 0.92;
    u.rate = 1.08;
  } else if (role === "chris") {
    delay = 60;
    u.pitch = 0.78; // Long Island accent, lighting foreman
    u.rate = 0.86;
  } else if (role === "joe") {
    delay = 60;
    u.pitch = 0.7; // loud, already mid-sentence
    u.rate = 1.08;
  } else if (role === "utah" || role === "tremont") {
    u.pitch = getTraveler() === "tremont" ? 1.05 : 1.15;
    u.rate = getTraveler() === "tremont" ? 1.02 : 1.1;
  } else if (role === "lemon") {
    delay = 60;
    u.pitch = 0.55; // lower, gym-floor volume
    u.rate = 0.92;
  } else {
    u.pitch = 0.88 + Math.random() * 0.25;
    u.rate = 1.0;
  }
  u.voice = rosterVoice(role);
  const go = () => {
    try {
      speechSynthesis.speak(u);
    } catch (_) {}
  };
  if (delay) setTimeout(go, delay);
  else go();
}

function speakAs(role, text, opts) {
  if (!text || !settings.voice) return;
  recoverAudio();
  const url = voice.map && voice.map[role + "|" + text];
  if (url) {
    stopVoice();
    playClip(url, role, text);
    return;
  }
  if (!voice.map) {
    voice.pending = { role, text };
    loadVoicePack();
    return;
  }
  // No baked clip for this line. Don't kill whatever's already playing, and
  // put the words on screen so the character doesn't read as dead. Callers
  // that already show the text (the radio HUD) pass shown:true.
  if (!opts || !opts.shown) toast(text);
}

let radioWho = "";
const RADIO_META = {
  lugo: { tag: "LUGO · CH. 3", src: "assets/lugo_portrait.jpg" },
  lemon: { tag: "LEMON · CH. 3", src: "assets/lemon_portrait.jpg?v=73" },
  tremont: { tag: "TREMONT · BOOK 2", src: "assets/tremont_portrait.jpg" },
  utah: { tag: "UTAH · BOOK 2", src: "assets/utah_portrait.jpg" },
  drew: { tag: "DREW · GENERAL FOREMAN", src: "assets/drew_portrait.jpg" },
  joe: { tag: "JOE RIVERA", src: "assets/joe_portrait.jpg?v=120" },
  chris: { tag: "CHRIS · LIGHTING", src: "assets/chris_portrait.jpg?v=120" },
  don: { tag: "DON THE FOREMAN", src: "assets/don_portrait.jpg?v=120" },
  safety: { tag: "MARITZA · SITE SAFETY", src: "assets/safety_portrait.jpg" },
  redbeard: { tag: "RED BEARD · DATA 1", src: "assets/redbeard_portrait.jpg?v=120" },
  andy: { tag: "ANDY · SICK & NEEDY", src: "assets/andy_portrait.jpg?v=120" },
  nate: { tag: "NATE · WIENERS", src: "assets/nate_portrait.jpg?v=120" },
  kenny: { tag: "KENNY THE STEW", src: "assets/kenny_portrait.jpg?v=120" },
};

const FACE_SRC = {
  redbeard: "/assets/redbeard_face.jpg?v=120",
  andy: "/assets/andy_face.jpg?v=120",
  nate: "/assets/nate_face.jpg?v=120",
  kenny: "/assets/kenny_face.jpg?v=120",
  safety: "/assets/safety_face.jpg?v=120",
  gf: "/assets/drew_face.jpg?v=120",
  joe: "/assets/joe_face.jpg?v=120",
  chris: "/assets/chris_face.jpg?v=120",
  don: "/assets/don_face.jpg?v=120",
  lugo: "/assets/lugo_face.jpg?v=120",
  lemon: "/assets/lemon_face.jpg?v=120",
};

function paintRadioFace(who) {
  const meta = RADIO_META[who] || (isTremont() ? RADIO_META.lemon : RADIO_META.lugo);
  radioWho = who || (isTremont() ? "lemon" : "lugo");
  const tag = document.querySelector(".radio-tag");
  if (tag) tag.textContent = meta.tag;
  const face = $("radio-face");
  if (face) {
    face.src = meta.src;
    face.alt = meta.tag;
  }
}

function radioPack() {
  return isTremont() ? RADIO_LEMON : RADIO;
}
function dayStartLines(d) {
  const c = cycleDay(d);
  if (weekOfDay(d) >= 2) {
    if (isTremont()) return WEEK2_START_LEMON[c] || RADIO_LEMON.start;
    return WEEK2_START[c] || RADIO.start;
  }
  if (isTremont()) return DAY_START_LEMON[c] || RADIO_LEMON.start;
  return DAY_START[c] || RADIO.start;
}
function idlePool() {
  const c = cycleDay(day);
  const dayLines = isTremont() ? DAY_IDLE_LEMON[c] : DAY_IDLE[c];
  const always = (isTremont() ? RADIO_LEMON.idleAlways : RADIO.idleAlways) || [];
  // night shift stays on diesel talk — don't drift into red-pipe / VESDA idle
  if (c === 4 && dayLines && dayLines.length) return dayLines;
  if (dayLines && dayLines.length && Math.random() < 0.75) return dayLines;
  return always.length ? always : dayLines || RADIO.idleAlways;
}
function jobCompleteRadio(id) {
  if (cycleDay(day) === 4 && id === "facp") {
    const n = radioPack().facpNight;
    return n && n[0];
  }
  if (id === "tools") return null;
  const lines = radioPack()[id];
  return lines && lines[0];
}
function foremanChat() {
  return isTremont() ? LEMON_CHAT : LUGO_CHAT;
}

function radioFore(lugoText, lemonText) {
  radio(isTremont() ? lemonText : lugoText);
}

function radio(line, who) {
  if (!who) who = foremanWho();
  if (who === "lugo" && isTremont()) who = "lemon";
  if (who === "lemon" && !isTremont()) who = "lugo";
  sfx("radio");
  $("radio-line").textContent = line;
  paintRadioFace(who);
  $("radio").classList.add("show");
  speakAs(who, line, { shown: true });
  clearTimeout(radioTimer);
  radioTimer = setTimeout(() => $("radio").classList.remove("show"), 5200);
}

bootTTS();

const ui = { promptLabel: undefined, zone: "", clock: "", clockHot: null };

function addWatts(n, label) {
  const bonus = Math.round(n * (1 + state.combo * 0.08));
  state.watts += bonus;
  const txt = state.watts.toLocaleString();
  $("watts").textContent = txt;
  $("watts-mini").textContent = "PTS " + txt;
  if (label) toast(`${label}  +${bonus}`);
}

function setHearts() {
  const box = $("hearts");
  box.innerHTML = "";
  for (let i = 0; i < 3; i++) {
    const p = document.createElement("div");
    p.className = "pip" + (i < state.hp ? " on" : "");
    box.appendChild(p);
  }
}

function flash(color = "#c8f6ff") {
  const f = $("flash");
  f.style.background = color;
  f.classList.add("on");
  setTimeout(() => f.classList.remove("on"), 90);
}

function formatTime(t) {
  const s = Math.max(0, Math.ceil(t));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

/* Prefer numeric seconds; fall back to "m:ss" strings from older local saves */
function bestSecondsOf(rec) {
  if (!rec) return 0;
  let sec = Number(rec.seconds);
  if (Number.isFinite(sec) && sec > 0) return Math.round(sec);
  const t = String(rec.time || "");
  const m = t.match(/^(\d+):(\d{1,2})$/);
  if (m) return Math.round(Number(m[1]) * 60 + Number(m[2]));
  return 0;
}

/* When scores tie, keep a real clock — never let 0:00 beat a finished run */
function betterRun(a, b) {
  if (!b) return true;
  if (!a) return false;
  const ap = Number(a.pts) || 0;
  const bp = Number(b.pts) || 0;
  if (ap !== bp) return ap > bp;
  const as = Number(a.seconds) || 0;
  const bs = Number(b.seconds) || 0;
  if (as > 0 && bs > 0) return as < bs;
  if (as > 0 && bs <= 0) return true;
  if (as <= 0 && bs > 0) return false;
  return false;
}

/* ------------------------------------------------------------------ */
/*  WORLD PRIMITIVES                                                   */
/* ------------------------------------------------------------------ */
function boxMesh(w, h, d, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = false;
  m.receiveShadow = false;
  return m;
}

function addCollider(x, z, w, d, y = 0, h = 8) {
  state.colliders.push({
    minx: x - w / 2,
    maxx: x + w / 2,
    minz: z - d / 2,
    maxz: z + d / 2,
    y,
    h,
  });
}

function placeBox(x, y, z, w, h, d, mat, collide = true) {
  const m = boxMesh(w, h, d, mat);
  m.position.set(x, y + h / 2, z);
  scene.add(m);
  if (collide) addCollider(x, z, w, d, y, h);
  return m;
}

function collideXZ(x, z, r, y = player.position.y) {
  for (let i = 0; i < 3; i++) {
    for (const b of state.colliders) {
      if (y + 0.2 > b.y + b.h) continue;
      const nx = Math.max(b.minx, Math.min(x, b.maxx));
      const nz = Math.max(b.minz, Math.min(z, b.maxz));
      let dx = x - nx;
      let dz = z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        const dist = Math.sqrt(d2);
        if (dist < 1e-6) {
          // center is inside the box — the clamp gives no direction, which used
          // to make the wall inert; eject through the nearest face instead
          const w = x - b.minx, e = b.maxx - x, s = z - b.minz, n = b.maxz - z;
          const m = Math.min(w, e, s, n);
          if (m === w) x = b.minx - r - 0.001;
          else if (m === e) x = b.maxx + r + 0.001;
          else if (m === s) z = b.minz - r - 0.001;
          else z = b.maxz + r + 0.001;
          continue;
        }
        const push = r - dist + 0.001;
        x += (dx / dist) * push;
        z += (dz / dist) * push;
      }
    }
  }
  x = THREE.MathUtils.clamp(x, -233, 168);
  z = THREE.MathUtils.clamp(z, -30, CB.z1 + 70);
  return { x, z };
}

function inWet(x, z) {
  for (const w of state.wet) {
    if (Math.hypot(x - w.x, z - w.z) < w.r) return true;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/*  PLAYER                                                             */
/* ------------------------------------------------------------------ */
const player = new THREE.Group();
player.position.set(SPAWN.x, 0, SPAWN.z);
const pvel = { x: 0, y: 0, z: 0 };
const kick = { x: 0, z: 0 }; // hazard knockback, kept apart from input velocity
let shakeT = 0; // camera shake after a hit
let liftSndT = 0; // hydraulic tick while the scissor moves
let grounded = true;
let facing = 0;
let stepAcc = 0;
let sprintOn = false;
let sprintTaught = false;

function mat(color, opts = {}) {
  return new THREE.MeshLambertMaterial({ color, ...opts });
}

/* shared vertex-colored material — lets many flat-colored parts merge
   into a single draw call */
const VERT_MAT = new THREE.MeshLambertMaterial({ vertexColors: true });

function colorizeGeo(geo, color) {
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = color.r;
    arr[i * 3 + 1] = color.g;
    arr[i * 3 + 2] = color.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return geo;
}

/* merge a group's direct-child flat Lambert meshes into one
   vertex-colored mesh (skips maps, transparency, and emissive parts) */
function mergeLambertChildren(g) {
  const parts = [];
  const rm = [];
  for (const c of g.children) {
    if (
      c.isMesh &&
      c.material &&
      c.material.isMeshLambertMaterial &&
      !c.material.map &&
      !c.material.transparent &&
      (!c.material.emissive || c.material.emissive.getHex() === 0) &&
      c.geometry &&
      c.geometry.index &&
      c.geometry.attributes.uv &&
      c.children.length === 0
    ) {
      c.updateMatrix();
      parts.push(colorizeGeo(c.geometry.clone().applyMatrix4(c.matrix), c.material.color));
      rm.push(c);
    }
  }
  if (parts.length < 2) return;
  for (const c of rm) g.remove(c);
  const merged = BufferGeometryUtils.mergeGeometries(parts, false);
  if (!merged) return;
  for (const p of parts) p.dispose();
  g.add(new THREE.Mesh(merged, VERT_MAT));
}

function makeElectrician() {
  const g = new THREE.Group();
  const fit = wornOutfit();
  const isTremont = getTraveler() === "tremont";
  const SHIRTC = { shirt_red: 0xc62828, shirt_black: 0x1c1c1c, shirt_blue: 0x1e3a6e }[fit.shirt] || COLORS.shirt;
  const PANTSC = { pants_jeans: 0x3b5678, pants_khaki: 0x8a7a5a, pants_black: 0x24262a }[fit.pants] || COLORS.jeans;
  const HATC = { hat_white: 0xf4f1ea, hat_black: 0x24262a, hat_cowboy: 0xc8a05a }[fit.hat] || COLORS.hat;
  const tw = isTremont ? 0.5 : 0.46;
  const td = isTremont ? 0.28 : 0.26;

  if (fit.shirt === "shirt_pride") {
    // pride tee reads loud — open hi-vis rails so the flag isn't buried under the vest
    const stripesC = [0xd32f2f, 0xf57c00, 0xfbc02d, 0x388e3c, 0x1976d2, 0x7b1fa2];
    stripesC.forEach((c, i) => {
      const s = boxMesh(0.48, 0.52 / 6, 0.28, mat(c));
      s.position.set(0, 1.18 + 0.26 - (i + 0.5) * (0.52 / 6), 0);
      g.add(s);
    });
    for (const sx of [-0.26, 0.26]) {
      const rail = boxMesh(0.1, 0.52, 0.3, mat(COLORS.vest));
      rail.position.set(sx, 1.2, 0);
      g.add(rail);
    }
    const stripe = boxMesh(0.56, 0.07, 0.22, mat(COLORS.stripe));
    stripe.position.set(0, 1.36, 0.06);
    g.add(stripe);
    const stripe2 = boxMesh(0.56, 0.04, 0.22, mat(COLORS.orange));
    stripe2.position.set(0, 1.3, 0.06);
    g.add(stripe2);
  } else {
    const torso = boxMesh(tw, 0.52, td, mat(SHIRTC));
    torso.position.set(0, 1.18, 0);
    g.add(torso);
    if (fit.shirt === "shirt_black") {
      const moon = boxMesh(0.1, 0.14, 0.015, mat(0xe8e8f0));
      moon.position.set(0.06, 1.2, 0.135);
      g.add(moon);
    }
    const vest = boxMesh(tw + 0.06, 0.5, td + 0.04, mat(COLORS.vest));
    vest.position.set(0, 1.2, 0);
    g.add(vest);
    const stripe = boxMesh(tw + 0.08, 0.06, td + 0.06, mat(COLORS.stripe));
    stripe.position.set(0, 1.28, 0);
    g.add(stripe);
    const stripe2 = boxMesh(tw + 0.08, 0.035, td + 0.06, mat(COLORS.orange));
    stripe2.position.set(0, 1.22, 0);
    g.add(stripe2);
  }

  const bottle = boxMesh(0.07, 0.16, 0.07, mat(0x8ec8e8, { transparent: true, opacity: 0.7 }));
  bottle.position.set(0.14, 1.32, 0.18);
  g.add(bottle);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 12), mat(COLORS.skin));
  head.position.set(0, 1.58, 0);
  g.add(head);
  if (isTremont) {
    const blonde = 0xe8c45c;
    const blondeDeep = 0xc49a38;
    const blondeLite = 0xf4dc8c;
    // tiny emissive keeps locks out of the vertex-color merge so they stay strands
    const hmat = (c) => new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: 0.1 });
    const hairMat = hmat(blonde);
    const hairDeep = hmat(blondeDeep);
    const hairLite = hmat(blondeLite);
    function curlyLock(ox, oy, oz, len, radius, waves, phase, swayX, swayZ, m) {
      const pts = [];
      const n = 12;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const amp = 0.028 + t * 0.02;
        pts.push(
          new THREE.Vector3(
            ox + Math.sin(t * waves * Math.PI * 2 + phase) * amp + t * swayX,
            oy - t * len,
            oz + Math.cos(t * waves * Math.PI * 2 + phase * 0.65) * amp * 0.7 + t * swayZ
          )
        );
      }
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, radius, 5, false), m));
    }
    const tones = [hairMat, hairDeep, hairLite];
    // nape fan — under the brim, hanging to the shoulders
    for (let i = 0; i < 13; i++) {
      const a = -1.05 + (i / 12) * 2.1;
      const ox = Math.sin(a) * 0.2;
      const oz = -Math.cos(a) * 0.2 - 0.02;
      curlyLock(
        ox,
        1.6,
        oz,
        0.22 + (i % 3) * 0.02,
        0.016 + (i % 2) * 0.003,
        2.2 + (i % 4) * 0.25,
        i * 0.7,
        Math.sin(a) * 0.08,
        -0.02 + Math.abs(Math.sin(a)) * 0.04,
        tones[i % 3]
      );
    }
    // second ring, sits further out so the curtain reads full
    for (let i = 0; i < 9; i++) {
      const a = -0.95 + (i / 8) * 1.9;
      curlyLock(
        Math.sin(a) * 0.24,
        1.57,
        -Math.cos(a) * 0.22 - 0.03,
        0.22 + (i % 2) * 0.02,
        0.015,
        2.5 + (i % 3) * 0.2,
        i * 0.9 + 0.4,
        Math.sin(a) * 0.1,
        0.02,
        tones[(i + 1) % 3]
      );
    }
    // over-shoulder sweeps, rest on the delts from the front
    for (const s of [-1, 1]) {
      curlyLock(s * 0.2, 1.58, -0.04, 0.2, 0.018, 2.3, 0.4, s * 0.12, 0.1, hairLite);
      curlyLock(s * 0.22, 1.54, 0.02, 0.21, 0.016, 2.6, 1.2, s * 0.12, 0.16, hairDeep);
      curlyLock(s * 0.18, 1.5, 0.06, 0.2, 0.015, 2.1, 2.0, s * 0.08, 0.12, hairMat);
    }
    // face-framing tendrils beside the glasses
    for (const s of [-1, 1]) {
      curlyLock(s * 0.15, 1.6, 0.1, 0.2, 0.013, 2.0, 0.6, s * 0.04, 0.08, hairLite);
      curlyLock(s * 0.17, 1.62, 0.04, 0.2, 0.014, 1.8, 1.8, s * 0.05, 0.04, hairDeep);
    }
    const lensM = mat(0x1a1a1a);
    const glassM = new THREE.MeshLambertMaterial({ color: 0x88aacc, transparent: true, opacity: 0.4 });
    for (const sx of [-0.075, 0.075]) {
      const frame = boxMesh(0.09, 0.065, 0.025, lensM);
      frame.position.set(sx, 1.595, 0.145);
      g.add(frame);
      const lens = boxMesh(0.07, 0.05, 0.012, glassM);
      lens.position.set(sx, 1.595, 0.158);
      g.add(lens);
    }
    const bridge = boxMesh(0.045, 0.016, 0.018, lensM);
    bridge.position.set(0, 1.595, 0.15);
    g.add(bridge);
  } else {
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.165, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(COLORS.hair));
    hair.position.set(0, 1.62, 0);
    g.add(hair);
    const beard = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), mat(COLORS.beard));
    beard.scale.set(1, 0.7, 0.7);
    beard.position.set(0, 1.48, 0.1);
    g.add(beard);
    const stache = boxMesh(0.1, 0.025, 0.04, mat(COLORS.beard));
    stache.position.set(0, 1.54, 0.15);
    g.add(stache);
  }

  const hat = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(HATC));
  hat.position.set(0, 1.7, 0);
  if (isTremont) hat.rotation.x = -0.14;
  g.add(hat);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(fit.hat === "hat_cowboy" ? 0.31 : 0.22, fit.hat === "hat_cowboy" ? 0.31 : 0.22, 0.03, 16), mat(HATC));
  brim.position.set(0, 1.64, 0);
  if (isTremont) brim.rotation.x = -0.14;
  g.add(brim);
  const lamp = boxMesh(0.07, 0.05, 0.06, mat(0x222));
  lamp.position.set(0, 1.76, 0.14);
  g.add(lamp);
  const lampG = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), mat(0xfff2c8, { emissive: 0xffe08a, emissiveIntensity: 0.8 }));
  lampG.position.set(0, 1.76, 0.18);
  g.add(lampG);
  const band = boxMesh(0.34, 0.04, 0.34, mat(0x6b5a3a));
  band.position.set(0, 1.66, 0);
  g.add(band);
  const decal = boxMesh(0.05, 0.04, 0.01, mat(0xff8a1a));
  decal.position.set(-0.08, 1.78, 0.14);
  g.add(decal);
  const muffL = new THREE.Mesh(new THREE.SphereGeometry(isTremont ? 0.042 : 0.055, 8, 6), mat(0x1a1a1a));
  muffL.scale.set(0.65, 1, 0.85);
  muffL.position.set(isTremont ? 0.155 : 0.17, 1.68, 0.04);
  g.add(muffL);
  const muffR = muffL.clone();
  muffR.position.x = isTremont ? -0.155 : -0.17;
  g.add(muffR);

  function limb(w, h, d, color, x, y) {
    const m = boxMesh(w, h, d, mat(color));
    const hold = new THREE.Group();
    hold.position.set(x, y, 0);
    m.position.y = -h / 2;
    hold.add(m);
    g.add(hold);
    return hold;
  }
  const armW = isTremont ? 0.145 : 0.12;
  const armL = limb(armW, 0.48, armW, COLORS.skin, isTremont ? 0.36 : 0.34, 1.4);
  const armR = limb(armW, 0.48, armW, COLORS.skin, isTremont ? -0.36 : -0.34, 1.4);
  const shirtL = boxMesh(0.14, 0.16, 0.14, mat(fit.shirt === "shirt_pride" ? 0xd32f2f : SHIRTC));
  shirtL.position.set(0, -0.06, 0);
  armL.add(shirtL);
  const shirtR = boxMesh(0.14, 0.16, 0.14, mat(fit.shirt === "shirt_pride" ? 0xd32f2f : SHIRTC));
  shirtR.position.set(0, -0.06, 0);
  armR.add(shirtR);
  const watch = boxMesh(0.13, 0.04, 0.13, mat(0x111));
  watch.position.set(0, -0.28, 0);
  armL.add(watch);

  const legL = limb(0.16, 0.58, 0.16, PANTSC, 0.12, 0.92);
  const legR = limb(0.16, 0.58, 0.16, PANTSC, -0.12, 0.92);
  const bootL = boxMesh(0.17, 0.14, 0.24, mat(COLORS.boot));
  bootL.position.set(0, -0.58, 0.03);
  legL.add(bootL);
  const bootR = boxMesh(0.17, 0.14, 0.24, mat(COLORS.boot));
  bootR.position.set(0, -0.58, 0.03);
  legR.add(bootR);

  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.38, 16), new THREE.MeshBasicMaterial({ color: 0x000, transparent: true, opacity: 0.32 }));
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.02;
  g.add(blob);

  if (fit.extra === "x_chain") {
    const chain = boxMesh(0.2, 0.025, 0.02, mat(0xd8b036));
    chain.position.set(0, 1.44, 0.135);
    g.add(chain);
  }
  if (fit.extra === "x_squints") {
    const squints = boxMesh(0.24, 0.035, 0.02, mat(0x1a1c20));
    squints.position.set(0, 1.6, 0.145);
    g.add(squints);
  }

  mergeLambertChildren(g);
  for (const h of [armL, armR, legL, legR]) mergeLambertChildren(h);

  g.userData = { armL, armR, legL, legR, blob };
  return g;
}

let body = makeElectrician();
player.add(body);
scene.add(player);
player.traverse((o) => (o.userData.noBake = true));

function rebuildPlayerBody() {
  player.remove(body);
  body.traverse((o) => {
    if (o.isMesh) {
      o.geometry?.dispose();
      if (o.material && o.material !== VERT_MAT) o.material.dispose?.();
    }
  });
  body = makeElectrician();
  player.add(body);
  player.traverse((o) => (o.userData.noBake = true));
}

const titlePrev = { r: null, s: null, c: null, body: null, raf: 0 };

function disposeTitlePreview() {
  if (titlePrev.raf) cancelAnimationFrame(titlePrev.raf);
  titlePrev.raf = 0;
  if (titlePrev.body && titlePrev.s) titlePrev.s.remove(titlePrev.body);
  titlePrev.body?.traverse((o) => {
    if (o.isMesh) {
      o.geometry?.dispose();
      if (o.material && o.material !== VERT_MAT) o.material.dispose?.();
    }
  });
  titlePrev.body = null;
  if (titlePrev.r) {
    titlePrev.r.dispose();
    titlePrev.r = null;
  }
  titlePrev.s = null;
  titlePrev.c = null;
}

function refreshTitlePreview() {
  const canvas = $("traveler-prev");
  if (!canvas || state.mode !== "title") return;
  try {
    if (!titlePrev.r) {
      titlePrev.r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: "low-power" });
      titlePrev.r.setPixelRatio(Math.min(devicePixelRatio || 1, 1.25));
      titlePrev.r.setSize(canvas.width, canvas.height, false);
      titlePrev.r.setClearColor(0x000000, 0);
      titlePrev.s = new THREE.Scene();
      titlePrev.s.add(new THREE.HemisphereLight(0xfff2d8, 0x2a3020, 1.2));
      const key = new THREE.DirectionalLight(0xfff5e0, 0.9);
      key.position.set(1.4, 3.2, 2.4);
      titlePrev.s.add(key);
      const rim = new THREE.DirectionalLight(0x88aa66, 0.4);
      rim.position.set(-2, 1.2, -1.5);
      titlePrev.s.add(rim);
      titlePrev.c = new THREE.PerspectiveCamera(30, canvas.width / canvas.height, 0.1, 20);
      titlePrev.c.position.set(1.65, 1.18, 2.85);
      titlePrev.c.lookAt(0, 1.18, 0);
      const spin = () => {
        titlePrev.raf = requestAnimationFrame(spin);
        if (state.mode !== "title" || !titlePrev.r || !titlePrev.body) return;
        if (window.__lwTitleYaw != null) titlePrev.body.rotation.y = window.__lwTitleYaw;
        else titlePrev.body.rotation.y += 0.012;
        titlePrev.r.render(titlePrev.s, titlePrev.c);
      };
      titlePrev.raf = requestAnimationFrame(spin);
    }
    if (titlePrev.body) {
      titlePrev.s.remove(titlePrev.body);
      titlePrev.body.traverse((o) => {
        if (o.isMesh) {
          o.geometry?.dispose();
          if (o.material && o.material !== VERT_MAT) o.material.dispose?.();
        }
      });
    }
    titlePrev.body = makeElectrician();
    titlePrev.body.rotation.y = 0.7;
    titlePrev.s.add(titlePrev.body);
  } catch (err) {
    console.warn("[LW] title preview skipped", err);
  }
}

function jump() {
  if (state.mode !== "play") return;
  if (dayState.utv) {
    if (dayState.utvStun > 0) return;
    dayState.utvHop = true;
    return;
  }
  if (dayState.driving) return; // scissors don't hop
  if (dayState.carrying) {
    toast("NOT WITH A REEL ON", true);
    return;
  }
  if (dayState.pushCart) {
    toast("NOT WITH THE CART", true);
    return;
  }
  if (grounded) {
    pvel.y = 6.6;
    grounded = false;
    sfx("thud");
  }
}

/* ------------------------------------------------------------------ */
/*  BUILD WORLD                                                        */
/* ------------------------------------------------------------------ */
async function buildWorld() {
  const [gravel, concrete, metal, panelTex, skyTex, refElec, refMech] = await Promise.all([
    loadTex("/assets/tex_gravel.jpg", 10, 8),
    loadTex("/assets/tex_concrete.jpg", 8, 8),
    loadTex("/assets/tex_metal.jpg", 3, 2),
    loadTex("/assets/tex_panel.jpg", 1, 1),
    loadTex("/assets/tex_sky.jpg", 1, 1),
    loadTex("/assets/ref_elec.jpg", 1, 1),
    loadTex("/assets/ref_mech.jpg", 1, 1),
  ]);

  mats.gravel = new THREE.MeshLambertMaterial({ map: gravel, color: 0xd0c8b4 });
  mats.concrete = new THREE.MeshLambertMaterial({ map: concrete, color: 0xc8c8c4 });
  mats.metal = new THREE.MeshLambertMaterial({ map: metal, color: 0xb8bec4 });
  mats.panel = new THREE.MeshLambertMaterial({ map: panelTex });
  mats.dark = mat(0x3a3e44);
  mats.beam = mat(0x6e747c);
  mats.orange = mat(COLORS.orange);
  mats.yellow = mat(0xf0d23c);
  mats.wood = mat(0x8a6234);
  mats.copper = mat(0xc46a22);
  mats.redFA = mat(0xb71c1c);
  mats.emt = mat(0xc2c6cb);
  mats.pipeBlk = mat(0x2a2a2e);
  mats.pump = mat(0x3d8a58);
  mats.crah = mat(0xc9b89a);
  mats.lake = new THREE.MeshLambertMaterial({ color: 0x6d8796 });
  mats.tape = makeTapeMat();
  mats.refElec = refElec
    ? new THREE.MeshBasicMaterial({ map: refElec })
    : mats.metal;
  mats.refMech = refMech
    ? new THREE.MeshBasicMaterial({ map: refMech })
    : mats.metal;
  if (refElec) {
    refElec.wrapS = refElec.wrapT = THREE.ClampToEdgeWrapping;
  }
  if (refMech) {
    refMech.wrapS = refMech.wrapT = THREE.ClampToEdgeWrapping;
  }

  // phone GPUs pay for every light in every lit fragment — keep the count low.
  // The 8 pod point lights are folded into stronger hemi/ambient fill.
  const hemi = new THREE.HemisphereLight(0xccd8e2, 0x6e6850, 1.0);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xeef2f4, 0.95);
  sun.position.set(-30, 40, 10);
  scene.add(sun);
  const amb = new THREE.AmbientLight(0xa8b0a2, 0.42);
  scene.add(amb);
  dayLights = { hemi, sun, amb };

  // night-shift rig: dim pod lights + Utah's headlamp (only lit on day 4)
  nightRig = { pods: [], lamp: null };
  for (let i = 0; i < CB.pods; i++) {
    for (const x of [CB.dataX, CB.hallWX, CB.hallEX, CB.elecWX]) {
      const pl = new THREE.PointLight(0xffd9a0, 0.7, 22);
      pl.position.set(x, 6.2, podBand(i).mid);
      pl.visible = false;
      scene.add(pl);
      nightRig.pods.push(pl);
    }
  }
  const lamp = new THREE.SpotLight(0xfff2d8, 2.4, 26, 0.55, 0.45);
  lamp.position.set(0, 1.78, 0.15);
  const lampTarget = new THREE.Object3D();
  lampTarget.position.set(0, 1.0, 6);
  player.add(lampTarget);
  lamp.target = lampTarget;
  lamp.visible = false;
  player.add(lamp);
  nightRig.lamp = lamp;

  const yard = new THREE.Mesh(new THREE.PlaneGeometry(140, 60), mats.gravel);
  yard.rotation.x = -Math.PI / 2;
  yard.position.set((CB.west + CB.east) / 2, 0, 22);
  scene.add(yard);

  const bW = CB.east - CB.west;
  const bD = CB.z1 - CB.z0;
  const hallFloor = new THREE.Mesh(new THREE.PlaneGeometry(bW + 2, bD + 2), mats.concrete);
  hallFloor.rotation.x = -Math.PI / 2;
  hallFloor.position.set((CB.west + CB.east) / 2, 0.01, (CB.z0 + CB.z1) / 2);
  scene.add(hallFloor);

  const wrap = new THREE.Mesh(new THREE.PlaneGeometry(220, 160), mats.gravel);
  wrap.rotation.x = -Math.PI / 2;
  wrap.position.set((CB.west + CB.east) / 2, -0.02, 70);
  scene.add(wrap);

  const northYard = new THREE.Mesh(new THREE.PlaneGeometry(200, 28), mats.gravel);
  northYard.rotation.x = -Math.PI / 2;
  northYard.position.set((CB.west + CB.east) / 2, 0, CB.z1 + 14);
  scene.add(northYard);

  const shore = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 10),
    new THREE.MeshLambertMaterial({ color: 0x5a5348 })
  );
  shore.rotation.x = -Math.PI / 2;
  shore.position.set(0, 0.02, CB.z1 + 26);
  scene.add(shore);

  for (let i = 0; i < 40; i++) {
    const rock = boxMesh(0.5 + Math.random() * 1.1, 0.25 + Math.random() * 0.35, 0.5 + Math.random() * 0.8, mat(0x6a6560));
    rock.position.set(-90 + i * 4.6 + Math.random() * 1.5, 0.15, CB.z1 + 25.5 + Math.random() * 2);
    rock.rotation.y = Math.random() * 1.5;
    scene.add(rock);
  }

  mats.lake = new THREE.MeshPhongMaterial({
    color: 0x4a6d7c,
    specular: 0x9ec4d4,
    shininess: 38,
    emissive: 0x0a1520,
    emissiveIntensity: 0.12,
  });
  const lake = new THREE.Mesh(new THREE.PlaneGeometry(420, 160, 8, 4), mats.lake);
  lake.rotation.x = -Math.PI / 2;
  lake.position.set(0, -0.22, CB.z1 + 108);
  scene.add(lake);
  state.lake = lake;

  const farShore = new THREE.Mesh(new THREE.PlaneGeometry(400, 18), new THREE.MeshLambertMaterial({ color: 0x4a5348 }));
  farShore.rotation.x = -Math.PI / 2;
  farShore.position.set(0, 0.05, CB.z1 + 186);
  scene.add(farShore);

  buildOuterSite();

  const lakeSign = makeLabel("LAKE ONTARIO", "#c9d6de");
  lakeSign.position.set(0, 2.4, CB.z1 + 22);
  scene.add(lakeSign);

  // 237's mascot, working the shoreline
  const gull = new THREE.Group();
  const gBody = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), mat(0xf2f2f0));
  gBody.scale.set(1.5, 1, 1);
  gull.add(gBody);
  const gHead = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), mat(0xf2f2f0));
  gHead.position.set(0.18, 0.11, 0);
  gull.add(gHead);
  const gBeak = boxMesh(0.07, 0.02, 0.015, mat(0xff8a1a));
  gBeak.position.set(0.26, 0.1, 0);
  gull.add(gBeak);
  const gWingL = boxMesh(0.2, 0.015, 0.3, mat(0xd8d8d4));
  gWingL.position.set(-0.02, 0.06, 0.14);
  gull.add(gWingL);
  const gWingR = gWingL.clone();
  gWingR.position.z = -0.14;
  gull.add(gWingR);
  gull.position.set(10, 0.13, CB.z1 + 22.5);
  gull.rotation.y = 0.7;
  scene.add(gull);
  gull.traverse((o) => (o.userData.noBake = true));
  state.gull = { mesh: gull, flying: false, t: 0, home: gull.position.clone() };

  if (skyTex) {
    skyTex.wrapS = skyTex.wrapT = THREE.ClampToEdgeWrapping;
    const backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(420, 80),
      new THREE.MeshBasicMaterial({ map: skyTex, fog: false })
    );
    backdrop.position.set(0, 28, CB.z1 + 195);
    scene.add(backdrop);
  }
  for (let i = 0; i < 10; i++) {
    const t = boxMesh(1.6 + Math.random(), 5 + Math.random() * 4, 1.6, mat(0x3d4a38));
    t.position.set(-85 + Math.random() * 8, 2.8, CB.z1 + 8 + i * 2.2);
    scene.add(t);
    const t2 = t.clone();
    t2.position.x = CB.east + 10 + Math.random() * 8;
    scene.add(t2);
  }

  buildCB4();
  buildYardSet();
  buildPowerYard();
  buildCrane();
  buildCoolers();
  buildInteractables();
  buildForklift();
  buildUtvs();
  buildRacks();
  buildSiteTraffic();

  // the fill-the-site dressing pass — hundreds of props, all static,
  // all collapsed by the merge
  buildExtraDressing({ THREE, scene, mats, mat, boxMesh, placeBox, addCollider, CB, podBand, makeLabel, getTraveler });

  worldItems = state.interactables.slice();
  state.built = true;
}

/* ------------------------------------------------------------------ */
/*  OUTER SITE — matched to the Lake Mariner aerial (no temp overlay). */
/*  CB-4 playable, CB-5 iron-up east, miner halls N-S west, Somerset   */
/*  on the shore, cooling ponds, switchyard, parking lots, SE loop.    */
/* ------------------------------------------------------------------ */
function buildOuterSite() {
  const z1 = CB.z1;
  const grass = mat(0x4e6a40);
  const grassDark = mat(0x3d5634);
  const asphalt = mat(0x3a3c40);
  const lotMat = mat(0x45474c);
  const stripe = mat(0xc8c8bc);
  const yellowLine = mat(0xc9b23a);
  const pondMat = new THREE.MeshBasicMaterial({ color: 0x5cb85a });
  const pondDeep = new THREE.MeshBasicMaterial({ color: 0x3e8a48 });
  const truckColors = [0x8a1a1a, 0x1a2a4a, 0xd8d8d8, 0x2a2a2a, 0x5a3a1a, 0x3a5a3a, 0x6a6a72, 0xb8b8c0, 0x4a1a1a, 0x1c3a5a];

  function pad(w, d, x, z, m, y) {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m);
    g.rotation.x = -Math.PI / 2;
    g.position.set(x, y, z);
    scene.add(g);
    return g;
  }

  function roadEW(x, z, len, width) {
    pad(len, width, x, z, asphalt, 0.05);
    const n = Math.max(2, Math.floor(len / 8));
    for (let i = 0; i < n; i++) {
      const dash = boxMesh(2.4, 0.02, 0.12, yellowLine);
      dash.position.set(x - len / 2 + 4 + i * (len / n), 0.06, z);
      scene.add(dash);
    }
  }

  function roadNS(x, z, len, width) {
    pad(width, len, x, z, asphalt, 0.05);
    const n = Math.max(2, Math.floor(len / 8));
    for (let i = 0; i < n; i++) {
      const dash = boxMesh(0.12, 0.02, 2.4, yellowLine);
      dash.position.set(x, 0.06, z - len / 2 + 4 + i * (len / n));
      scene.add(dash);
    }
  }

  function pickup(x, z, yaw, color) {
    const body = boxMesh(1.9, 1.35, 4.4, mat(color));
    body.position.set(x, 0.7, z);
    body.rotation.y = yaw;
    scene.add(body);
    const cab = boxMesh(1.8, 0.55, 1.5, mat(0x1a1c20));
    cab.position.set(x + Math.sin(yaw) * 0.95, 1.55, z + Math.cos(yaw) * 0.95);
    cab.rotation.y = yaw;
    scene.add(cab);
  }

  function sedan(x, z, yaw, color) {
    const body = boxMesh(1.7, 1.05, 4.0, mat(color));
    body.position.set(x, 0.55, z);
    body.rotation.y = yaw;
    scene.add(body);
    const roof = boxMesh(1.5, 0.4, 1.8, mat(0x1a1c20));
    roof.position.set(x - Math.sin(yaw) * 0.15, 1.25, z - Math.cos(yaw) * 0.15);
    roof.rotation.y = yaw;
    scene.add(roof);
  }

  function fleet(x0, z0, cols, rows, yaw, gapX, gapZ, seed) {
    let n = seed;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        n++;
        if (n % 7 === 3) continue;
        const x = x0 + c * gapX;
        const z = z0 + r * gapZ;
        const col = truckColors[n % truckColors.length];
        const wob = ((n % 5) - 2) * 0.012;
        if (n % 3 === 0) sedan(x, z, yaw + wob, col);
        else pickup(x, z, yaw + wob, col);
        // collide per car, not per row — a row box walled off the empty
        // stalls (the n%7 skips) and the walk-through gaps between cars
        const sideways = Math.abs(Math.sin(yaw)) > 0.7;
        addCollider(x, z, sideways ? 4.6 : 2.2, sideways ? 2.2 : 4.6, 0, 1.6);
      }
    }
  }

  function stalls(x0, z0, count, pitch, alongX) {
    for (let i = 0; i <= count; i++) {
      const line = boxMesh(alongX ? 0.06 : 4.8, 0.015, alongX ? 4.8 : 0.06, stripe);
      line.position.set(x0 + (alongX ? i * pitch : 0), 0.042, z0 + (alongX ? 0 : i * pitch));
      scene.add(line);
    }
  }

  function pole(x, z) {
    const p = boxMesh(0.12, 6.6, 0.12, mat(0x3a3a3c));
    p.position.set(x, 3.3, z);
    scene.add(p);
    const head = boxMesh(1.2, 0.12, 0.35, mat(0x2a2a2c));
    head.position.set(x, 6.6, z);
    scene.add(head);
  }

  function tree(x, z, h) {
    const trunk = boxMesh(0.45, h * 0.4, 0.45, mat(0x4a3a28));
    trunk.position.set(x, h * 0.2, z);
    scene.add(trunk);
    const canopy = boxMesh(1.7 + (h - 5) * 0.15, h * 0.65, 1.7, mat(0x3d4a38));
    canopy.position.set(x, h * 0.68, z);
    scene.add(canopy);
  }

  for (const [w, d, x, z] of [
    [160, 220, -165, 70],
    [160, 220, 155, 70],
    [400, 80, 5, -20],
  ]) {
    pad(w, d, x, z, mats.gravel, -0.04);
  }

  /* ---- grass carpets: perimeter fields, shore belt, pond banks ---- */
  pad(420, 90, 0, -55, grass, 0.004);
  pad(90, 200, -200, 50, grass, 0.004);
  pad(70, 220, 200, 40, grassDark, 0.004);
  pad(360, 22, 0, z1 + 18, grass, 0.006);
  pad(80, 80, -70, 40, grass, 0.005);
  pad(50, 40, 70, -8, grass, 0.005);

  /* ---- cooling ponds (two green rectangles west of Somerset, up by the shore) ---- */
  pad(38, 24, -176, 168, pondMat, 0.08);
  pad(28, 16, -176, 168, pondDeep, 0.09);
  pad(38, 22, -176, 196, pondMat, 0.08);
  pad(28, 14, -176, 196, pondDeep, 0.09);
  for (const [x, z, w, d] of [
    [-176, 182, 42, 3.5],
    [-176, 154, 42, 3.5],
    [-176, 210, 42, 3.5],
    [-157, 182, 3.5, 58],
    [-195, 182, 3.5, 58],
  ]) {
    placeBox(x, 0, z, w, 0.9, d, mat(0x6a5a48), true);
  }
  const pondSign = makeLabel("COOLING PONDS", "#9adf6a");
  pondSign.position.set(-155, 2.2, 168);
  pondSign.rotation.y = Math.PI / 2;
  scene.add(pondSign);

  /* ---- main E-W access road (no temp no-park overlay) ---- */
  roadEW(0, 22, 340, 10);
  roadNS(-48, 4, 36, 7);
  roadNS(88, -6, 44, 8);
  roadEW(40, -18, 90, 7);
  roadNS(-176, 10, 28, 6);

  /* ---- SE loop road (the big curve on the aerial) ---- */
  const loop = new THREE.Mesh(
    new THREE.RingGeometry(46, 56, 40, 1, -0.15, Math.PI * 1.55),
    asphalt
  );
  loop.rotation.x = -Math.PI / 2;
  loop.position.set(128, 0.05, -40);
  scene.add(loop);

  /* ---- parking lots ---- */
  pad(78, 28, -92, 4, lotMat, 0.03);
  stalls(-126, 4, 12, 5.4, true);
  fleet(-126, -4, 12, 3, 0, 5.4, 8.2, 11);
  pole(-92, 16);
  pole(-70, -8);
  pole(-114, 16);

  pad(96, 26, 8, 4, lotMat, 0.03);
  stalls(-36, 4, 14, 5.5, true);
  fleet(-36, -4, 14, 3, 0, 5.5, 8.0, 31);
  pole(-20, 16);
  pole(20, -8);
  pole(40, 16);

  pad(50, 20, 120, 6, lotMat, 0.03);
  fleet(100, 0, 8, 2, 0, 5.4, 8.4, 51);
  pole(120, 14);

  pad(36, 16, -150, 6, lotMat, 0.03);
  fleet(-164, 0, 6, 2, 0, 5.2, 8.0, 71);

  pad(34, 20, 128, -40, lotMat, 0.03);
  fleet(114, -46, 6, 2, Math.PI / 2, 8.2, 5.4, 91);
  pole(128, -30);

  const parkSign = makeLabel("CREW PARKING", "#d6f04a");
  parkSign.position.set(-56, 2.0, 16.5);
  parkSign.rotation.y = Math.PI;
  scene.add(parkSign);

  /* ---- CB-5: iron's up, walls are half-hung, Ferguson's mess everywhere */
  const c5x0 = CB.c5x0;
  const c5x1 = CB.c5x1;
  const c5z0 = CB.z0;
  const c5z1 = z1;
  const slab = new THREE.Mesh(new THREE.PlaneGeometry(c5x1 - c5x0 + 4, c5z1 - c5z0 + 4), mats.concrete);
  slab.rotation.x = -Math.PI / 2;
  slab.position.set((c5x0 + c5x1) / 2, 0.02, (c5z0 + c5z1) / 2);
  scene.add(slab);
  for (let x = c5x0; x <= c5x1; x += 10) {
    for (const z of [c5z0, c5z1]) placeBox(x, 0, z, 0.5, 9, 0.5, mats.beam, true);
  }
  for (let z = c5z0 + 13; z < c5z1; z += 13) {
    for (const x of [c5x0, c5x1]) placeBox(x, 0, z, 0.5, 9, 0.5, mats.beam, true);
  }
  for (let x = c5x0 + 5; x < c5x1; x += 10) {
    const truss = boxMesh(0.35, 0.35, c5z1 - c5z0, mats.beam);
    truss.position.set(x, 8.8, (c5z0 + c5z1) / 2);
    scene.add(truss);
  }
  wallAlongZ(c5x0 + 0.6, c5z0, c5z0 + 52);
  wallAlongX(c5z0 + 0.6, c5x0, c5x0 + 34, []);
  const deck5 = boxMesh(36, 0.2, 54, mats.metal);
  deck5.position.set(c5x0 + 18, 9.1, c5z0 + 27);
  scene.add(deck5);
  const cb5Sign = makeLabel("CB-5 · IRON UP", "#ffb03a");
  cb5Sign.position.set(c5x0 + 6, 4.4, c5z0 - 1.2);
  cb5Sign.rotation.y = Math.PI;
  scene.add(cb5Sign);
  for (let i = 0; i < 8; i++) {
    placeBox(c5x0 + 6 + (i % 4) * 9, 0, 30 + Math.floor(i / 4) * 10, 6, 1.1, 2.2, i % 2 ? mats.beam : mats.wood, true);
  }
  for (const [x, z] of [
    [c5x0 + 26, 34],
    [c5x0 + 34, 40],
    [c5x0 + 18, 44],
  ]) {
    const bundle = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 8, 8), mats.metal);
    bundle.rotation.z = Math.PI / 2;
    bundle.position.set(x, 0.5, z);
    scene.add(bundle);
  }

  /* ---- miner halls west: three parallel N-S buildings (CB-1 / 2 / 3) ---- */
  const minerNames = ["CB-1 · LIVE", "CB-2 · LIVE", "CB-3 · LIVE"];
  for (let r = 0; r < 3; r++) {
    const mx = -90 - r * 24;
    const mz = 102;
    placeBox(mx, 0, mz, 18, 7.2, 68, mats.metal, true);
    for (let i = 0; i < 15; i++) {
      const lz = mz - 30 + i * 4.2;
      const lv = boxMesh(0.18, 5.2, 3.6, mat(0x5a6066));
      lv.position.set(mx - 9.15, 3, lz);
      scene.add(lv);
      const lv2 = lv.clone();
      lv2.position.x = mx + 9.15;
      scene.add(lv2);
    }
    for (let i = 0; i < 8; i++) {
      const fan = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 1, 10), mat(0x4a5056));
      fan.position.set(mx, 7.8, mz - 28 + i * 8);
      scene.add(fan);
    }
    const ms = makeLabel(minerNames[r], "#9adf6a");
    ms.position.set(mx, 3.6, mz - 35.2);
    ms.rotation.y = Math.PI;
    scene.add(ms);
  }
  placeBox(-70, 0, 78, 14, 5.4, 22, mats.metal, true);
  const denSign = makeLabel("WULF DEN", "#9adf6a");
  denSign.position.set(-70, 3.0, 65.6);
  denSign.rotation.y = Math.PI;
  scene.add(denSign);

  /* ---- old Somerset plant on the shore, stack and all ---- */
  placeBox(-112, 0, 162, 40, 24, 26, mat(0x6a6258), true);
  placeBox(-88, 0, 154, 14, 15, 14, mat(0x7a7268), true);
  placeBox(-130, 0, 148, 18, 10, 16, mat(0x5a564e), true);
  const conveyor = boxMesh(30, 1.4, 2.4, mat(0x5a5248));
  conveyor.position.set(-74, 9, 160);
  conveyor.rotation.z = 0.32;
  scene.add(conveyor);
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.4, 64, 12), mat(0xb8b4ac));
  stack.position.set(-124, 32, 170);
  scene.add(stack);
  const plantSign = makeLabel("SOMERSET STATION", "#c9d6de");
  plantSign.position.set(-98, 4.2, 147);
  scene.add(plantSign);

  /* ---- switchyard ---- */
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 4; c++) {
      powerTransformer(-128 + c * 14, 42 + r * 12, 0);
    }
  }
  for (let i = 0; i < 14; i++) placeBox(-136 + i * 5, 0, 34, 0.14, 2.2, 0.14, mats.beam, false);
  for (let i = 0; i < 3; i++) {
    const bus = boxMesh(48, 0.08, 0.08, mat(0xc8b070));
    bus.position.set(-118, 4.4 + i * 0.35, 42);
    scene.add(bus);
  }
  const swSign = makeLabel("SWITCHYARD · KEEP OUT", "#ff5a4a");
  swSign.position.set(-118, 2.6, 33.4);
  swSign.rotation.y = Math.PI;
  scene.add(swSign);

  /* ---- tank farm, north between miners and CB-4 ---- */
  for (const tz of [152, 168]) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 6.5, 11, 18), mat(0xe8e6e0));
    tank.position.set(-58, 5.5, tz);
    scene.add(tank);
    addCollider(-58, tz, 13.5, 13.5, 0, 11);
  }

  /* ---- leftover demo scrap near the gate trailers ---- */
  for (let i = 0; i < 5; i++) {
    const m = boxMesh(2 + (i % 3) * 0.8, 0.6 + (i % 2) * 0.7, 2 + (i % 4) * 0.5, mat(0x6a6862));
    m.position.set(28 + (i % 3) * 4.5, 0.4, -4 + Math.floor(i / 3) * 5);
    m.rotation.y = i * 0.4;
    scene.add(m);
  }

  /* ---- trailer row by the gate ---- */
  for (let i = 0; i < 3; i++) placeBox(46 + i * 9, 0, 4, 7, 2.8, 3, mat(i === 1 ? 0xd8d4c8 : 0xcfc8b4), true);
  const gateSign = makeLabel("GATE · LAKE MARINER", "#d6f04a");
  gateSign.position.set(8, 2.2, -2);
  gateSign.rotation.y = Math.PI;
  scene.add(gateSign);

  /* ---- shore + east tree belts ---- */
  for (let i = 0; i < 28; i++) {
    tree(-150 + i * 11.2, z1 + 21 + (i % 3) * 1.4, 5.5 + (i % 4) * 1.1);
  }
  for (let i = 0; i < 18; i++) {
    tree(178 + (i % 3) * 6, -30 + i * 11, 6 + (i % 3) * 1.4);
  }
  for (let i = 0; i < 10; i++) {
    tree(-198, 10 + i * 14, 5.8 + (i % 2));
  }
  buildLandfillCourse();
}

function makeTapeMat() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 32;
  const x = c.getContext("2d");
  x.fillStyle = "#ff6a1a";
  x.fillRect(0, 0, 256, 32);
  x.fillStyle = "#111";
  for (let i = 0; i < 10; i++) {
    x.beginPath();
    x.moveTo(i * 28 - 8, 0);
    x.lineTo(i * 28 + 6, 0);
    x.lineTo(i * 28 + 18, 32);
    x.lineTo(i * 28 + 4, 32);
    x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(6, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide });
}

function wallSeg(x, z, w, d, h = 8) {
  placeBox(x, 0, z, w, h, d, mats.metal, true);
}

function wallAlongZ(x, z0, z1, gaps = []) {
  const t = 0.42;
  let segs = [{ a: z0, b: z1 }];
  for (const g of gaps) {
    const g0 = g.z - g.w / 2,
      g1 = g.z + g.w / 2;
    const next = [];
    for (const p of segs) {
      if (g1 <= p.a || g0 >= p.b) next.push(p);
      else {
        if (g0 > p.a + 0.2) next.push({ a: p.a, b: g0 });
        if (g1 < p.b - 0.2) next.push({ a: g1, b: p.b });
      }
    }
    segs = next;
  }
  for (const p of segs) {
    const d = p.b - p.a;
    if (d < 0.35) continue;
    placeBox(x, 0, (p.a + p.b) / 2, t, 8, d, mats.metal, true);
  }
}

function wallAlongX(z, x0, x1, gaps = []) {
  const t = 0.42;
  let segs = [{ a: x0, b: x1 }];
  for (const g of gaps) {
    const g0 = g.x - g.w / 2,
      g1 = g.x + g.w / 2;
    const next = [];
    for (const p of segs) {
      if (g1 <= p.a || g0 >= p.b) next.push(p);
      else {
        if (g0 > p.a + 0.2) next.push({ a: p.a, b: g0 });
        if (g1 < p.b - 0.2) next.push({ a: g1, b: p.b });
      }
    }
    segs = next;
  }
  for (const p of segs) {
    const w = p.b - p.a;
    if (w < 0.35) continue;
    placeBox((p.a + p.b) / 2, 0, z, w, 8, t, mats.metal, true);
  }
}

/* jobsite rough opening — jambs + lintel + floor stripe, no extra collider */
function doorFrame(x, z, alongZ, w) {
  const jamb = 0.2;
  const thick = 0.62;
  const head = 5.15;
  if (alongZ) {
    placeBox(x, 0, z - w / 2, thick, head, jamb, mats.dark, false);
    placeBox(x, 0, z + w / 2, thick, head, jamb, mats.dark, false);
    placeBox(x, head, z, thick + 0.1, 0.28, w + jamb, mats.beam, false);
    placeBox(x, 0, z, thick + 0.2, 0.05, w, mats.yellow, false);
  } else {
    placeBox(x - w / 2, 0, z, jamb, head, thick, mats.dark, false);
    placeBox(x + w / 2, 0, z, jamb, head, thick, mats.dark, false);
    placeBox(x, head, z, w + jamb, 0.28, thick + 0.1, mats.beam, false);
    placeBox(x, 0, z, w, 0.05, thick + 0.2, mats.yellow, false);
  }
}

function makeLabel(text, color = "#d6f04a") {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 128;
  const x = c.getContext("2d");
  x.fillStyle = "#16180d";
  x.fillRect(0, 0, 512, 128);
  x.strokeStyle = color;
  x.lineWidth = 8;
  x.strokeRect(8, 8, 496, 112);
  x.fillStyle = color;
  x.font = "bold 48px Oswald, Arial, sans-serif";
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.fillText(text, 256, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), new THREE.MeshBasicMaterial({ map: tex }));
  return m;
}

function buildCB4() {
  const z0 = CB.z0,
    z1 = CB.z1;
  const roomDoor = 3.2;
  const hallDoor = 3.6;
  const cg = crossGaps(); // open punch-throughs where cross-halls hit N-S walls

  // ── outer shell ──
  // long halls open at south/north; no doors along the long halls themselves
  const southDoors = [
    { x: CB.hallWX, w: hallDoor },
    { x: CB.hallEX, w: hallDoor },
  ];
  wallAlongX(z0, CB.west, CB.east, southDoors);
  wallAlongX(z1, CB.west, CB.east, southDoors);
  wallAlongZ(CB.west, z0, z1);
  wallAlongZ(CB.east, z0, z1);
  for (const d of southDoors) {
    doorFrame(d.x, z0, false, d.w);
    doorFrame(d.x, z1, false, d.w);
  }

  // ── N-S walls between bands — open at every cross-hall (continuous long halls) ──
  // MECH | HALL_W | ELEC_W | FAN_W | DATA | FAN_E | ELEC_E | HALL_E
  const nsWalls = [CB.hallW0, CB.elecW0, CB.fanW0, CB.data0, CB.data1, CB.fanE1, CB.elecE1];
  for (const x of nsWalls) wallAlongZ(x, z0, z1, cg);

  // ── E-W walls on north & south of each SECTION (not in long-hall columns) ──
  // Doors into rooms face the cross-halls. Long hall columns stay open N-S.
  function roomFronts(z) {
    // mech
    wallAlongX(z, CB.west, CB.hallW0, [{ x: CB.mechX, w: roomDoor }]);
    doorFrame(CB.mechX, z, false, roomDoor);
    // west electrical
    wallAlongX(z, CB.elecW0, CB.fanW0, [{ x: CB.elecWX, w: roomDoor }]);
    doorFrame(CB.elecWX, z, false, roomDoor);
    // west fan
    wallAlongX(z, CB.fanW0, CB.data0, [{ x: CB.fanWX, w: roomDoor }]);
    doorFrame(CB.fanWX, z, false, roomDoor);
    // data hall
    wallAlongX(z, CB.data0, CB.data1, [{ x: CB.dataX, w: hallDoor }]);
    doorFrame(CB.dataX, z, false, hallDoor);
    // east fan
    wallAlongX(z, CB.data1, CB.fanE1, [{ x: CB.fanEX, w: roomDoor }]);
    doorFrame(CB.fanEX, z, false, roomDoor);
    // east electrical
    wallAlongX(z, CB.fanE1, CB.elecE1, [{ x: CB.elecEX, w: roomDoor }]);
    doorFrame(CB.elecEX, z, false, roomDoor);
    // long hall columns intentionally have NO E-W wall — open into cross-halls
  }
  for (let i = 0; i < CB.pods; i++) {
    const { z0: pz, z1: pz1 } = podBand(i);
    roomFronts(pz);   // south face of section → south cross-hall
    roomFronts(pz1);  // north face of section → north cross-hall
  }

  // ceiling
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(CB.east - CB.west + 1, z1 - z0 + 1), mats.metal);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set((CB.west + CB.east) / 2, 8.05, (z0 + z1) / 2);
  scene.add(ceil);

  // ── dressing per section ──
  for (let i = 0; i < CB.pods; i++) {
    const { z0: pz, mid } = podBand(i);
    const signD = makeLabel(`POD ${i + 1} · DATA`);
    signD.position.set(CB.dataX, 3.2, pz + 1.4);
    scene.add(signD);

    // conduit run in data hall
    const run = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 10, 6),
      isTremont() ? mats.emt : mats.redFA
    );
    run.rotation.x = Math.PI / 2;
    run.position.set(CB.dataX + 2.0, 2.55, mid);
    scene.add(run);

    // data hall columns + the E-W cross tray feeding the N-S runs
    for (const dx of [-10, 10]) {
      placeBox(CB.dataX + dx, 0, mid - 5, 0.4, 8, 0.4, mats.beam, true);
      placeBox(CB.dataX + dx, 0, mid + 5, 0.4, 8, 0.4, mats.beam, true);
    }
    placeBox(CB.dataX, 7.2, mid, 28, 0.12, 0.5, mats.beam, false);

    // fan units in both crawls
    for (const fx of [CB.fanWX, CB.fanEX]) {
      for (let k = 0; k < 2; k++) {
        const fz = mid - 4 + k * 8;
        const fan = boxMesh(1.5, 2.6, 2.2, mats.dark);
        fan.position.set(fx, 1.4, fz);
        scene.add(fan);
        addCollider(fx, fz, 1.5, 2.2, 0, 2.6);
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.18, 12), mats.beam);
        ring.rotation.z = Math.PI / 2;
        ring.position.set(fx + (fx < 0 ? 0.7 : -0.7), 1.5, fz);
        scene.add(ring);
      }
      if (i === 0) {
        const cSign = makeLabel("FAN CRAWL");
        cSign.position.set(fx, 3.15, mid);
        cSign.rotation.y = fx < 0 ? Math.PI / 2 : -Math.PI / 2;
        scene.add(cSign);
      }
    }

    // VESDA pipe in west fan crawl (Utah)
    if (!isTremont()) {
      const samp = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 12, 6), mats.orange);
      samp.rotation.x = Math.PI / 2;
      samp.position.set(CB.fanWX, 7.15, mid);
      scene.add(samp);
      for (let h = -4; h <= 4; h += 2) {
        const hole = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), mats.dark);
        hole.position.set(CB.fanWX, 7.15, mid + h);
        scene.add(hole);
      }
      const sampE = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 12, 6), mats.orange);
      sampE.rotation.x = Math.PI / 2;
      sampE.position.set(CB.fanEX, 7.15, mid);
      scene.add(sampE);
    }

    // electrical gear lines both sides
    for (const ex of [CB.elecWX, CB.elecEX]) {
      for (let z = pz + 2.5; z < pz + CB.podH - 2; z += 4.2) {
        placeBox(ex, 0, z, 1.1, 2.2, 1.5, mats.panel, true);
      }
      if (i === 0) {
        const eSign = makeLabel("ELECTRICAL");
        eSign.position.set(ex, 3.2, pz + 1.4);
        scene.add(eSign);
      }
    }

    // mechanical pumps — west end, pod 1 only heavy, others light panels
    if (i === 0) {
      for (let k = 0; k < 2; k++) {
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 7, 8), mats.pipeBlk);
        pipe.rotation.z = Math.PI / 2;
        pipe.position.set(CB.mechX, 2.1 + k * 0.85, mid);
        scene.add(pipe);
      }
      const pump = boxMesh(1.2, 1.0, 1.7, mats.pump);
      pump.position.set(CB.mechX - 1.5, 0.55, mid - 3);
      scene.add(pump);
      addCollider(CB.mechX - 1.5, mid - 3, 1.2, 1.7, 0, 1.1);
      const mSign = makeLabel("MECHANICAL");
      mSign.position.set(CB.mechX, 3.2, pz + 1.4);
      scene.add(mSign);
    } else {
      placeBox(CB.mechX, 0, mid - 3, 1.3, 2.2, 1.4, mats.panel, true);
      placeBox(CB.mechX, 0, mid + 3, 1.3, 2.2, 1.4, mats.panel, true);
    }

    // NAC loop decal in data hall
    const pts = [];
    for (let n = 0; n <= 20; n++) {
      const t = n / 20;
      const a = 0.35 + t * Math.PI * 1.55;
      pts.push(new THREE.Vector3(CB.dataX + Math.cos(a) * 12, 0.035, mid + Math.sin(a) * 6.5));
    }
    scene.add(
      new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.055, 4, false),
        new THREE.MeshBasicMaterial({ color: 0xc45a28 })
      )
    );
  }

  // vistas
  const mechVista = new THREE.Mesh(new THREE.PlaneGeometry(8, 6.2), mats.refMech);
  mechVista.position.set(CB.mechX, 3.2, z1 - 0.35);
  mechVista.rotation.y = Math.PI;
  scene.add(mechVista);
  const elecVista = new THREE.Mesh(new THREE.PlaneGeometry(8, 6.2), mats.refElec);
  elecVista.position.set(CB.elecWX, 3.2, podBand(1).mid);
  elecVista.rotation.y = Math.PI / 2;
  scene.add(elecVista);

  addVistaLazy("/assets/vista_data.jpg", 8, 5, CB.dataX, 3.0, z1 - 0.35, Math.PI);
  addVistaLazy("/assets/vista_data2.jpg", 8, 5, CB.dataX, 3.0, z0 + 0.35, 0);
  addVistaLazy("/assets/vista_fan.jpg", 4.6, 6.1, CB.fanEX, 3.1, podBand(1).mid, -Math.PI / 2);
  addVistaLazy("/assets/vista_hall.jpg", 3.6, 5.1, CB.hallWX + 0.2, 2.9, crossBand(1).mid, Math.PI / 2);
  addVistaLazy("/assets/prints_plan.jpg", 4.6, 3.3, CB.data0 + 0.22, 2.2, podBand(0).mid - 4, Math.PI / 2);
  addVistaLazy("/assets/prints_nac.jpg", 2.6, 1.9, CB.west + 0.32, 1.9, podBand(0).mid + 2, Math.PI / 2);
  if (!isTremont()) {
    addVistaLazy("/assets/prints_xtri.jpg", 2.4, 1.8, CB.west + 0.3, 1.9, podBand(1).mid + 2, Math.PI / 2);
    addVistaLazy("/assets/prints_pull.jpg", 2.4, 1.8, CB.east - 0.3, 1.9, podBand(0).mid, -Math.PI / 2);
    addVistaLazy("/assets/prints_vesda.jpg", 3.4, 2.5, CB.fanW0 + 0.3, 2.15, podBand(0).mid + 3, Math.PI / 2);
  }

  addPuddle(CB.hallWX, crossBand(0).mid, 2.8);
  addPuddle(CB.dataX, crossBand(1).mid, 2.4);
  addPuddle(CB.mechX, podBand(0).mid, 1.6);
}

function spawnBurst(x, y, z, color) {
  state.fx = state.fx || [];
  for (let i = 0; i < 26; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), new THREE.MeshBasicMaterial({ color }));
    m.position.set(x, y, z);
    m.userData.noBake = true;
    scene.add(m);
    const a = Math.random() * Math.PI * 2;
    const b = Math.random() * Math.PI - Math.PI / 2;
    const sp = 4 + Math.random() * 5;
    state.fx.push({
      mesh: m,
      vx: Math.cos(a) * Math.cos(b) * sp,
      vy: Math.sin(b) * sp + 3,
      vz: Math.sin(a) * Math.cos(b) * sp,
      life: 1.6 + Math.random() * 0.7,
    });
  }
}

function updateFx(dt) {
  if (!state.fx || !state.fx.length) return;
  for (let i = state.fx.length - 1; i >= 0; i--) {
    const p = state.fx[i];
    p.life -= dt;
    p.vy -= 4.5 * dt;
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    const sc = Math.max(0.05, Math.min(1, p.life));
    p.mesh.scale.setScalar(sc);
    if (p.life <= 0 || p.mesh.position.y < 0) {
      scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
      state.fx.splice(i, 1);
    }
  }
}

function clearFx() {
  for (const p of state.fx || []) {
    scene.remove(p.mesh);
    p.mesh.geometry.dispose();
    p.mesh.material.dispose();
  }
  state.fx = [];
}

function addVistaLazy(url, w, h, x, y, z, rotY) {
  loadTex(url, 1, 1).then((t) => {
    if (!t) return; // asset not shipped yet — the wall just stays bare
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t }));
    m.position.set(x, y, z);
    m.rotation.y = rotY || 0;
    scene.add(m);
  });
}

function addPuddle(x, z, r) {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(r, 16),
    new THREE.MeshLambertMaterial({ color: 0x4a5a62, transparent: true, opacity: 0.55 })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.03, z);
  scene.add(m);
  state.wet.push({ x, z, r });
}

function buildYardSet() {
  // conex / tool crib — forward-right of spawn so the first job is on camera
  const crib = placeBox(9, 0, 18, 5.2, 2.6, 2.4, mats.orange, true);
  crib.material = mat(0xd45512);
  placeBox(9, 2.6, 18, 5.3, 0.15, 2.5, mats.dark, false);
  const door = boxMesh(1.2, 2.1, 0.08, mats.dark);
  door.position.set(9, 1.1, 19.25);
  scene.add(door);

  // more conex
  placeBox(-18, 0, 16, 4.6, 2.5, 2.2, mat(0x3d6a8a), true);
  placeBox(28, 0, 28, 3.2, 2.4, 2.2, mat(0xb8a14a), true);

  // lumber stacks
  for (let i = 0; i < 4; i++) placeBox(-8 + i * 0.55, 0, 24, 0.45, 0.9, 2.4, mats.wood, true);

  // cones
  for (const [x, z] of [
    [4, 18],
    [6, 18],
    [12, 32],
    [-6, 40],
    [22, 42],
    [-22, 36],
  ]) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.7, 8), mats.orange);
    c.position.set(x, 0.35, z);
    scene.add(c);
  }

  // porta
  placeBox(32, 0, 12, 1.2, 2.3, 1.2, mat(0x3d8a4a), true);

  // gang box
  placeBox(10, 0, 12, 1.4, 0.9, 0.8, mats.dark, true);

  // sign post (no text)
  placeBox(0, 0, 4, 0.12, 2.4, 0.12, mats.beam, true);
  const sign = boxMesh(1.6, 0.7, 0.08, mats.yellow);
  sign.position.set(0, 2.3, 4);
  scene.add(sign);

  // trailer / office
  placeBox(-30, 0, 8, 7, 2.8, 3, mat(0xcfc8b4), true);
}

function padTransformer(x, z, yaw) {
  const g = new THREE.Group();
  const tank = boxMesh(2.1, 1.7, 1.6, mat(0x4a5c3a));
  tank.position.y = 0.9;
  g.add(tank);
  const fin = boxMesh(0.12, 1.3, 1.4, mat(0x3a4a30));
  fin.position.set(1.15, 0.9, 0);
  g.add(fin);
  const fin2 = fin.clone();
  fin2.position.x = -1.15;
  g.add(fin2);
  const bush = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.55, 6), mat(0xddd));
  bush.position.set(0.4, 2.05, 0);
  g.add(bush);
  const bush2 = bush.clone();
  bush2.position.x = -0.4;
  g.add(bush2);
  g.position.set(x, 0, z);
  g.rotation.y = yaw || 0;
  scene.add(g);
  addCollider(x, z, 2.4, 1.9, 0, 2.2);
}

function powerTransformer(x, z, yaw) {
  const g = new THREE.Group();
  const tank = boxMesh(3.4, 2.6, 2.4, mat(0x6d7278));
  tank.position.y = 1.4;
  g.add(tank);
  for (let i = -1; i <= 1; i++) {
    const rad = boxMesh(0.18, 2.0, 2.2, mat(0x5a6066));
    rad.position.set(1.85, 1.3, i * 0.7);
    g.add(rad);
  }
  for (let i = -1; i <= 1; i++) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.9, 6), mat(0xeee8d8));
    b.position.set(i * 0.7, 3.15, 0);
    g.add(b);
  }
  g.position.set(x, 0, z);
  g.rotation.y = yaw || 0;
  scene.add(g);
  addCollider(x, z, 4.0, 2.8, 0, 3.2);
}

function upsTrailer(x, z, yaw) {
  const g = new THREE.Group();
  const body = boxMesh(3.2, 2.8, 8.5, mat(0xd8dce0));
  body.position.y = 1.55;
  g.add(body);
  const stripe = boxMesh(3.22, 0.18, 8.52, mat(0x1565c0));
  stripe.position.y = 2.5;
  g.add(stripe);
  for (let i = -2; i <= 2; i++) {
    const vent = boxMesh(0.08, 1.4, 1.1, mats.dark);
    vent.position.set(1.62, 1.5, i * 1.45);
    g.add(vent);
  }
  const ac = boxMesh(1.2, 0.45, 1.6, mats.dark);
  ac.position.set(0, 3.15, 2.2);
  g.add(ac);
  const ac2 = ac.clone();
  ac2.position.z = -2.2;
  g.add(ac2);
  g.position.set(x, 0, z);
  g.rotation.y = yaw || 0;
  scene.add(g);
  addCollider(x, z, yaw ? 8.8 : 3.4, yaw ? 3.4 : 8.8, 0, 3.2);
}

function buildPowerYard() {
  // mission-critical UPS trailers east of CB-4
  for (let i = 0; i < 6; i++) {
    upsTrailer(54, 56 + i * 10, 0);
  }
  for (let i = 0; i < 4; i++) {
    upsTrailer(62, 60 + i * 10, 0);
  }
  powerTransformer(-50, 58, 0.2);
  powerTransformer(-50, 68, 0.15);
  powerTransformer(-50, 78, 0.1);
  padTransformer(-46, 36, 0.4);
  padTransformer(-46, 42, 0.1);
  padTransformer(-42, 30, -0.2);
  padTransformer(22, 8, 0.6);
  padTransformer(28, 10, 0.3);
  padTransformer(-8, 6, 1.1);
  padTransformer(44, 38, 0);
  padTransformer(44, 44, 0);
}

function buildCrane() {
  // the crane works CB-5 now — that's where the iron's going up
  const base = placeBox(66, 0, 96, 3.4, 1.4, 3.8, mat(0xc62828), true);
  placeBox(66, 1.4, 94.4, 1.2, 1.1, 1.4, mat(0x222), true);
  const mast = placeBox(63.6, 0, 96, 0.55, 14, 0.55, mat(0xd32f2f), true);
  const boom = boxMesh(0.4, 0.4, 28, mat(0xe53935));
  boom.position.set(74, 12.6, 104);
  boom.rotation.x = -0.35;
  boom.rotation.y = 0.45;
  scene.add(boom);
  const hook = boxMesh(0.25, 0.6, 0.25, mat(0x222));
  hook.position.set(82, 6.5, 110);
  hook.userData.noBake = true;
  scene.add(hook);
  state.craneHook = hook;
  const load = boxMesh(1.6, 1.2, 1.2, mats.beam);
  load.position.set(82, 5.4, 110);
  load.userData.noBake = true;
  scene.add(load);
  hook.userData.load = load;
}

function fluidCooler(x, z) {
  const g = new THREE.Group();
  const body = boxMesh(3.8, 2.15, 3.4, mat(0xa8b2b8));
  body.position.y = 1.1;
  g.add(body);
  for (let i = -4; i <= 4; i++) {
    const louver = boxMesh(0.05, 1.85, 3.15, mat(0x7e868c));
    louver.position.set(1.92, 1.08, i * 0.36);
    g.add(louver);
    const l2 = louver.clone();
    l2.position.x = -1.92;
    g.add(l2);
  }
  for (const dz of [-0.75, 0.75]) {
    const cowl = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.78, 0.5, 10), mat(0x5c646a));
    cowl.position.set(0, 2.42, dz);
    g.add(cowl);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.12, 8), mats.dark);
    hub.position.set(0, 2.68, dz);
    g.add(hub);
  }
  g.position.set(x, 8.2, z);
  scene.add(g);
}

function buildCoolers() {
  // one roof over the whole CB-4 strip
  const deck = boxMesh(CB.east - CB.west - 2, 0.18, CB.z1 - CB.z0 - 4, mat(0x6a7076));
  deck.position.set((CB.west + CB.east) / 2, 8.12, (CB.z0 + CB.z1) / 2);
  scene.add(deck);

  for (let i = 0; i < CB.pods; i++) {
    const { z0, z1 } = podBand(i);
    for (const x of [CB.mechX, CB.dataX, CB.elecEX]) {
      fluidCooler(x, z0 + 6);
      fluidCooler(x, z1 - 6);
    }
  }

  const header = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.22, CB.z1 - CB.z0 - 8, 8),
    mat(0x4a5056)
  );
  header.rotation.x = Math.PI / 2;
  header.position.set(CB.dataX, 8.55, (CB.z0 + CB.z1) / 2);
  scene.add(header);
}

function spoolMesh() {
  const g = new THREE.Group();
  const wood = mat(0x9a6a38);
  const a = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.08, 12), wood);
  a.rotation.z = Math.PI / 2;
  a.position.x = -0.22;
  const b = a.clone();
  b.position.x = 0.22;
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.36, 12), mats.copper);
  cable.rotation.z = Math.PI / 2;
  g.add(a, b, cable);
  g.position.y = 0.38;
  return g;
}

function marker(color) {
  // fog:false — these have to punch through site fog or work spots vanish at range
  const m = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.34),
    new THREE.MeshBasicMaterial({ color, fog: false, transparent: true, opacity: 0.95 })
  );
  m.position.y = 2.35;
  m.userData.baseColor = color; // day-3 repaints markers; resets restore this
  m.userData.baseY = 2.35;
  m.renderOrder = 20;
  return m;
}

function placeWorkMarker(mk, x, z, y) {
  mk.position.set(x, y, z);
  mk.userData.baseY = y;
  mk.visible = true;
  return mk;
}

/* keep unfinished work diamonds visible, spinning, and at the right height */
function updateWorkMarkers(dt, t) {
  if (state.mode !== "play" && state.mode !== "end") return;
  const cur = currentJob();
  // loop-invariant — building this Set per interactable per frame was pure GC churn
  const jobIds = new Set((JOBS || []).map((j) => j.id));
  for (const it of state.interactables || []) {
    const mk = it.marker;
    if (!mk) continue;
    if (it.done) {
      mk.visible = false;
      continue;
    }
    // day 6 punch: only near (handled in day logic); don't force-show
    if (cycleDay(day) === 6 && it.punch) continue;
    // day 7 signs: only when ready for signoffs
    if (cycleDay(day) === 7 && it.sign) continue;

    // show every unfinished work diamond for the active jobs
    const isWork = jobIds.has(it.id) || it.demo || it.battery || it.mag || it.pullGame || it.reelTarget || it.check || it.eol || it.high;
    if (isWork || (cur && it.id === cur.id)) {
      mk.visible = true;
    }

    if (!mk.visible) continue;
    const by = mk.userData.baseY != null ? mk.userData.baseY : mk.position.y;
    mk.rotation.y += dt * 2.4;
    mk.position.y = by + Math.sin(t * 3.2 + (it.x || 0) * 0.3) * 0.18;
  }
}

function smokeMesh() {
  return isTremont() ? lightMesh() : smokeFaMesh();
}
function strobeMesh() {
  return isTremont() ? recMesh() : strobeFaMesh();
}
function pullMesh() {
  return isTremont() ? switchMesh() : pullFaMesh();
}
function faBoxMesh() {
  return isTremont() ? boxMesh(0.22, 0.22, 0.12, mats.emt) : boxMesh(0.22, 0.22, 0.12, mats.redFA);
}

function vesdaMesh() {
  const g = new THREE.Group();
  const cab = boxMesh(0.62, 1.38, 0.34, mat(0xc5c8cc));
  cab.position.y = 0.72;
  const door = boxMesh(0.46, 0.9, 0.02, mat(0x9aa0a8));
  door.position.set(0, 0.82, 0.18);
  const screen = boxMesh(0.24, 0.13, 0.02, new THREE.MeshLambertMaterial({ color: 0x14180e, emissive: 0x000000 }));
  screen.position.set(0, 1.18, 0.19);
  const led = new THREE.Mesh(
    new THREE.SphereGeometry(0.028, 8, 8),
    new THREE.MeshLambertMaterial({ color: 0x1a4a22, emissive: 0x000000 })
  );
  led.position.set(0.18, 1.36, 0.19);
  const pipeH = 5.4;
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, pipeH, 8), mats.orange);
  pipe.position.set(-0.2, 1.45 + pipeH / 2, 0);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 8), mats.dark);
  cap.position.set(-0.2, 1.45 + pipeH, 0);
  g.add(cab, door, screen, led, pipe, cap);
  g.userData = { led, screen };
  return g;
}

function smokeFaMesh() {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.07, 16), mat(0x8a8884));
  const led = new THREE.Mesh(
    new THREE.SphereGeometry(0.03, 6, 6),
    new THREE.MeshLambertMaterial({ color: 0x331111, emissive: 0x000000 })
  );
  led.position.set(0.12, -0.03, 0);
  g.add(disc, led);
  g.userData = { disc, led };
  return g;
}

function lightMesh() {
  const g = new THREE.Group();
  const can = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.1, 12), mat(0x5a6068));
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(0.19, 0.19, 0.035, 16),
    new THREE.MeshLambertMaterial({ color: 0xa8adb4, emissive: 0x000000 })
  );
  disc.position.y = -0.07;
  const led = new THREE.Mesh(
    new THREE.CircleGeometry(0.14, 16),
    new THREE.MeshLambertMaterial({ color: 0xd8dce0, emissive: 0x000000, side: THREE.DoubleSide })
  );
  led.rotation.x = -Math.PI / 2;
  led.position.y = -0.09;
  g.add(can, disc, led);
  g.userData = { disc, led };
  return g;
}

function strobeFaMesh() {
  const g = new THREE.Group();
  const plate = boxMesh(0.3, 0.3, 0.08, mat(0xc62828));
  const lens = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.14, 0.07),
    new THREE.MeshLambertMaterial({ color: 0xddeeff, emissive: 0x000000, transparent: true, opacity: 0.9 })
  );
  lens.position.z = 0.06;
  g.add(plate, lens);
  g.userData = { lens };
  return g;
}

function recMesh() {
  const g = new THREE.Group();
  const plate = boxMesh(0.14, 0.24, 0.028, mat(0xe8e2d4));
  const top = boxMesh(0.065, 0.065, 0.02, mat(0x4a4e54));
  top.position.set(0, 0.045, 0.02);
  const bot = top.clone();
  bot.position.y = -0.045;
  const lens = new THREE.Mesh(
    new THREE.SphereGeometry(0.016, 6, 6),
    new THREE.MeshLambertMaterial({ color: 0x1a4a28, emissive: 0x000000 })
  );
  lens.position.set(0.05, 0.1, 0.022);
  g.add(plate, top, bot, lens);
  g.userData = { lens };
  return g;
}

function pullFaMesh() {
  const g = new THREE.Group();
  const body = boxMesh(0.2, 0.3, 0.1, mat(0xc62828));
  const bar = boxMesh(0.12, 0.08, 0.05, mat(0xf0f0f0));
  bar.position.set(0, -0.02, 0.07);
  g.add(body, bar);
  return g;
}

function switchMesh() {
  const g = new THREE.Group();
  const plate = boxMesh(0.14, 0.24, 0.028, mat(0xe8e2d4));
  const toggle = boxMesh(0.032, 0.07, 0.045, mat(0x3a3e44));
  toggle.position.set(0, 0.02, 0.032);
  g.add(plate, toggle);
  return g;
}

// shared on/off disc materials — allocating a fresh material per call leaked
// one into the renderer caches every day transition, per device
const SMOKE_LOOK = {
  tremOn: new THREE.MeshLambertMaterial({ color: 0xfff4d6, emissive: 0xffe08a, emissiveIntensity: 0.7 }),
  tremOff: new THREE.MeshLambertMaterial({ color: 0xa8adb4 }),
  faOn: new THREE.MeshLambertMaterial({ color: 0xf4f1ea }),
  faOff: new THREE.MeshLambertMaterial({ color: 0x8a8884 }),
};
function setSmokeLook(s, on) {
  if (!s || !s.userData.disc) return;
  if (isTremont()) {
    s.userData.disc.material = on ? SMOKE_LOOK.tremOn : SMOKE_LOOK.tremOff;
    s.userData.led.material.emissive.setHex(on ? 0xffe8a0 : 0x000000);
    s.userData.led.material.emissiveIntensity = on ? 1.3 : 0;
  } else {
    s.userData.disc.material = on ? SMOKE_LOOK.faOn : SMOKE_LOOK.faOff;
    s.userData.led.material.emissive.setHex(on ? 0xff2a2a : 0x000000);
    s.userData.led.material.emissiveIntensity = on ? 0.9 : 0;
  }
}

function setStrobeLook(st, on) {
  if (!st || !st.lens) return;
  st.mounted = !!on;
  if (isTremont()) {
    st.lens.material.emissive.setHex(on ? 0x3cff6a : 0x000000);
    st.lens.material.emissiveIntensity = on ? 0.7 : 0;
  } else {
    st.lens.material.emissive.setHex(on ? 0x8899aa : 0x000000);
    st.lens.material.emissiveIntensity = on ? 0.25 : 0;
  }
}

function hangConduitMesh() {
  const p = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 2.2, 6), isTremont() ? mats.emt : mats.redFA);
  p.rotation.z = Math.PI / 2;
  return p;
}

function buildInteractables() {
  // Utah's red Rubbermaid material cart — the pouch rides on top,
  // the candy bag rides shotgun
  const cartRed = mat(0xb42222);
  const cart = new THREE.Group();
  const shelfTop = boxMesh(1.15, 0.09, 0.68, cartRed);
  shelfTop.position.y = 0.92;
  cart.add(shelfTop);
  const shelfLow = boxMesh(1.15, 0.09, 0.68, cartRed);
  shelfLow.position.y = 0.24;
  cart.add(shelfLow);
  for (const [px, pz] of [[-0.52, 0.28], [0.52, 0.28], [-0.52, -0.28], [0.52, -0.28]]) {
    const post = boxMesh(0.07, 0.75, 0.07, cartRed);
    post.position.set(px, 0.58, pz);
    cart.add(post);
    const caster = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 8), mats.dark);
    caster.rotation.z = Math.PI / 2;
    caster.position.set(px, 0.09, pz);
    cart.add(caster);
  }
  const handle = boxMesh(0.06, 0.5, 0.55, cartRed);
  handle.position.set(-0.62, 1.05, 0);
  cart.add(handle);
  cart.position.set(5.4, 0, 16.2);
  cart.rotation.y = 0.35;
  scene.add(cart);
  cart.traverse((o) => (o.userData.noBake = true)); // the cart rolls with Utah
  state.cart = cart;

  // the giant candy bag rides the lower shelf, wherever the cart goes
  const candy = new THREE.Group();
  const bag = boxMesh(0.34, 0.42, 0.2, mat(0xf0c23c));
  bag.position.y = 0.21;
  candy.add(bag);
  const bagTop = boxMesh(0.36, 0.06, 0.22, mat(0xc62828));
  bagTop.position.y = 0.45;
  candy.add(bagTop);
  candy.position.set(0.28, 0.29, -0.12);
  candy.rotation.y = -0.4;
  cart.add(candy);
  state.candyBag = candy;
  candy.visible = getTraveler() !== "tremont";

  addItem({ id: "coffee", mesh: candy, x: 5.4, z: 16.2, label: "Offer mood-enhancing drugs", candy: true, done: false });
  addItem({ id: "coffee", mesh: cart, x: 5.4, z: 16.2, label: "Push the cart", cartGrab: true, done: false });

  // high work — one device up on the tilt-up, scissor-only reach
  {
    const hx = CB.westHallX;
    const s = smokeMesh();
    s.rotation.x = Math.PI / 2; // wall-mounted: disc axis onto Z, face out to the yard
    s.position.set(hx, 5.2, CB.z0 - 0.55);
    scene.add(s);
    const mk = marker(0xff5a4a);
    placeWorkMarker(mk, hx, CB.z0 - 0.9, 5.0);
    scene.add(mk);
    addItem({
      id: "high",
      mesh: s,
      smoke: s,
      marker: mk,
      x: hx,
      z: CB.z0 - 0.7,
      y: 5.2,
      high: true,
      label: "Mount the high smoke",
      done: false,
    });
  }

  // pouch sits on a crate beside the cart (the cart can leave — the crib can't)
  const crate = boxMesh(0.7, 0.5, 0.55, mats.wood);
  crate.position.set(4.5, 0.25, 16.7);
  scene.add(crate);
  const pouch = boxMesh(0.45, 0.28, 0.2, mat(0x6a3e22));
  pouch.position.set(4.5, 0.65, 16.7);
  scene.add(pouch);
  const toolMk = marker(0xd6f04a);
  toolMk.scale.setScalar(1.2);
  placeWorkMarker(toolMk, 4.5, 16.7, 2.4);
  scene.add(toolMk);
  addItem({
    id: "tools",
    mesh: pouch,
    x: 4.5,
    z: 16.7,
    label: "Grab tool pouch",
    once: true,
    marker: toolMk,
  });

  // EMT to hang — data hall + both long halls + electrical (red FA / silver EMT)
  for (let i = 0; i < 2; i++) {
    const { mid } = podBand(i);
    const spots = [
      [CB.dataX, mid - 4],
      [CB.hallWX, mid],
      [CB.hallEX, mid + 3],
      [CB.elecWX, mid + 2],
    ];
    spots.forEach(([x, z]) => {
      const stub = hangConduitMesh();
      stub.position.set(x, 2.55, z);
      stub.visible = false;
      scene.add(stub);
      const mk = marker(0xff5a4a);
      placeWorkMarker(mk, x, z, 2.55);
      scene.add(mk);
      addItem({
        id: "conduit",
        mesh: stub,
        x,
        z,
        label: "Hang red EMT",
        marker: mk,
        conduit: stub,
      });
    });
  }

  // FA boxes — one per bay, alternating walls (print perimeters)
  for (let i = 0; i < CB.pods; i++) {
    const { mid } = podBand(i);
    const spec = i % 2 === 0
      ? { x: CB.cor0 - 0.4, z: mid - 3, rot: -Math.PI / 2 }
      : { x: CB.cor1 + 0.4, z: mid + 3, rot: Math.PI / 2 };
    const { x, z, rot } = spec;
    const b = faBoxMesh();
    b.position.set(x, 1.45, z);
    b.rotation.y = rot;
    b.visible = false;
    scene.add(b);
    const mk = marker(0xff5a4a);
    placeWorkMarker(mk, x, z, 2.35);
    scene.add(mk);
    addItem({
      id: "boxes",
      mesh: b,
      x,
      z,
      label: "Mount FA box",
      marker: mk,
      box: b,
    });
  }

  // live yellow feeders in electrical — hazard only
  const addSpark = (x, z, d7) => {
    const post = boxMesh(0.18, 1.1, 0.18, mats.dark);
    post.position.set(x, 0.55, z);
    post.userData.noBake = true;
    scene.add(post);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), new THREE.MeshBasicMaterial({ color: 0x9cf6ff }));
    tip.position.set(x, 1.25, z);
    scene.add(tip);
    const light = new THREE.PointLight(0x88e6ff, 0.9, 6);
    light.position.set(x, 1.4, z);
    scene.add(light);
    state.sparks.push({ mesh: post, tip, light, x, z, live: !d7, d7: !!d7, t: Math.random() * 10 });
  };
  addSpark(CB.elecWX, podBand(1).mid, false);
  addSpark(CB.elecWX, podBand(2).mid, false);
  // energize-day chaos: extra hot spots stay IN electrical, off the forklift lane
  addSpark(CB.elecWX, podBand(3).mid, true);
  addSpark(CB.elecEX, podBand(0).mid + 4, true);
  addSpark(CB.elecEX, podBand(2).mid + 4, true);

  // smokes — data hall every bay + both long halls on pod 0
  for (let i = 0; i < CB.pods; i++) {
    const { mid } = podBand(i);
    const spots = i === 0
      ? [[CB.dataX, mid], [CB.hallWX, mid], [CB.hallEX, mid]]
      : [[CB.dataX, mid]];
    spots.forEach(([x, z]) => {
      const s = smokeMesh();
      s.position.set(x, 7.35, z);
      scene.add(s);
      const mk = marker(0xff5a4a);
      placeWorkMarker(mk, x, z, 5.6); // high enough to read as ceiling work
      scene.add(mk);
      state.smokes.push(s);
      addItem({
        id: "smokes",
        mesh: s,
        x,
        z,
        label: "Hang smoke",
        marker: mk,
        smoke: s,
      });
    });
  }

  // strobes on the corridor walls BESIDE the hall doors (not in the opening)
  for (let i = 0; i < CB.pods; i++) {
    const { mid } = podBand(i);
    const east = i % 2 === 1;
    const x = east ? CB.data1 + 0.3 : CB.data0 - 0.3;
    const z = podBand(i).z0 - 0.4;
    const s = strobeMesh();
    s.position.set(x, 2.15, z);
    s.rotation.y = east ? Math.PI / 2 : -Math.PI / 2;
    scene.add(s);
    const mk = marker(0xff5a4a);
    placeWorkMarker(mk, x + (east ? -0.4 : 0.4), z, 2.7);
    scene.add(mk);
    const rec = { mesh: s, lens: s.userData.lens, mounted: false };
    state.strobes.push(rec);
    addItem({
      id: "nac",
      mesh: s,
      x: x + (east ? -0.5 : 0.5),
      z,
      label: "Mount horn-strobe",
      marker: mk,
      strobe: rec,
    });
  }
  const pullSpots = [
    { x: CB.dataX, z: CB.z0 + 0.7, rot: 0 },
    { x: CB.hallWX, z: CB.z0 + 0.7, rot: 0 },
    { x: CB.hallEX, z: CB.z0 + 0.7, rot: 0 },
  ];
  pullSpots.forEach(({ x, z, rot }) => {
    const p = pullMesh();
    p.position.set(x, 1.35, z);
    p.rotation.y = rot;
    scene.add(p);
    const mk = marker(0xff5a4a);
    placeWorkMarker(mk, x, z, 2.45);
    scene.add(mk);
    addItem({
      id: "nac",
      mesh: p,
      x,
      z,
      label: "Mount pull station",
      marker: mk,
      pull: true,
    });
  });

  // FACP — corridor wall, pod 1, BESIDE the hall door (not in the opening)
  const facpZ = podBand(0).z0 - 0.45;
  const facpX = CB.dataX + 4;
  const facp = placeBox(facpX, 0, facpZ, 0.45, 2.2, 1.4, mat(isTremont() ? 0x8a939c : 0xb71c1c), true);
  const facpGlass = boxMesh(0.04, 0.35, 0.55, mat(0x111));
  facpGlass.position.set(facpX + 0.24, 1.7, facpZ);
  scene.add(facpGlass);
  const faMk = marker(0xff5a4a);
  facp.add(faMk);
  faMk.position.set(0.35, 1.65, 0);
  faMk.userData.baseY = 1.65;
  addItem({
    id: "facp",
    mesh: facp,
    x: facpX + 0.8,
    z: facpZ,
    label: "Commission FACP",
    marker: faMk,
    facp: true,
  });

  // VESDAs — one in each fan crawl (Utah FA only), facing the aisle
  if (!isTremont()) {
    const vesdaSpots = [
      { x: CB.fanWX, z: podBand(0).mid + 3.2, yaw: -Math.PI / 2, kind: "fire" },
      { x: CB.fanEX, z: podBand(1).mid - 3.2, yaw: Math.PI / 2, kind: "fault" },
    ];
    for (const spec of vesdaSpots) {
      const { x, z, yaw, kind } = spec;
      const v = vesdaMesh();
      v.position.set(x, 0, z);
      v.rotation.y = yaw;
      scene.add(v);
      addCollider(x, z, 0.7, 0.5, 0, 1.45);
      const tag = makeLabel("VESDA");
      tag.position.set(x, 2.05, z);
      tag.rotation.y = yaw;
      scene.add(tag);
      const face = yaw < 0 ? -1 : 1;
      const mk = marker(0xff5a4a);
      placeWorkMarker(mk, x + face * 0.7, z, 2.5);
      scene.add(mk);
      addItem({
        id: "vesda",
        mesh: v,
        x: x + face * 0.9,
        z,
        label: "Land VESDA aux",
        marker: mk,
        vesda: true,
        vesdaKind: kind,
      });
    }
  }

  for (const [x, z] of [
    [20, 30],
    [-14, 18],
    [CB.corX, podBand(1).mid],
  ]) {
    const cup = boxMesh(0.12, 0.2, 0.12, mat(0x3a2a22));
    cup.position.set(x, 0.25, z);
    scene.add(cup);
    addItem({ id: "coffee", mesh: cup, x, z, label: "Steal a coffee", once: true, coffee: true });
  }

  // somewhere on site there's one gas-station tendy on a paper plate
  const tSpots = [
    [18, 26],
    [-10, 44],
    [28, 49.5],
  ];
  const [tx, tz] = tSpots[Math.floor(Math.random() * tSpots.length)];
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.02, 10), mat(0xf2efe4));
  plate.position.set(tx, 0.16, tz);
  plate.userData.noBake = true;
  scene.add(plate);
  const tendy = boxMesh(0.17, 0.07, 0.09, mat(0xa5702e));
  tendy.position.set(tx, 0.21, tz);
  scene.add(tendy);
  addItem({ id: "coffee", mesh: tendy, x: tx, z: tz, label: "Gas-station tendy", once: true, tender: true });
}

function addItem(it) {
  // interactables mutate at runtime — they must survive the static-world merge
  if (it.mesh) it.mesh.traverse((o) => (o.userData.noBake = true));
  if (it.marker) it.marker.traverse((o) => (o.userData.noBake = true));
  if (it.conduit) it.conduit.traverse((o) => (o.userData.noBake = true));
  if (it.box) it.box.traverse((o) => (o.userData.noBake = true));
  state.interactables.push({ ...it, done: false });
}

/* the permanent day-1 item list — later days reuse these meshes/positions */
let worldItems = [];

/* per-run mechanics state for the later days */
const GEN_FEED = 100;
const dayState = { ahjIdx: 0, ahjDwell: 0, corrections: 0, genT: GEN_FEED, carrying: false };

let dayLights = null;
let nightRig = null;

function setNight(on) {
  if (!dayLights) return;
  if (!on) {
    dayLights.hemi.intensity = 1.0;
    dayLights.sun.intensity = 0.95;
    dayLights.amb.intensity = 0.42;
    scene.background.setHex(0x8ea0ad);
    scene.fog.color.setHex(0x8ea0ad);
    scene.fog.near = 50;
    scene.fog.far = 360;
    if (nightRig) {
      for (const L of nightRig.pods) L.visible = false;
      nightRig.lamp.visible = false;
    }
    applyGennyVisual(false, false);
    const wrap = $("genny-wrap");
    if (wrap) wrap.classList.add("hidden");
    return;
  }
  scene.background.setHex(0x0a0e16);
  scene.fog.color.setHex(0x0a0e16);
  applyNightPower();
}

function applyNightPower(t) {
  if (cycleDay(day) !== 4 || !dayLights) return;
  const transferred = !!dayState.genTransferred;
  const fed = transferred || dayState.genT > 0;
  const low = !transferred && dayState.genT > 0 && dayState.genT < 18;
  dayLights.hemi.intensity = fed ? 0.58 : 0.10;
  dayLights.sun.intensity = fed ? 0.2 : 0.03;
  dayLights.amb.intensity = fed ? 0.4 : 0.06;
  scene.fog.near = fed ? 48 : 16;
  scene.fog.far = fed ? 260 : 90;
  if (nightRig) {
    let podsOn = fed;
    if (low && t != null) podsOn = Math.sin(t * 17) > -0.15;
    for (const L of nightRig.pods) {
      // flicker with intensity, not visibility — toggling visible changes the
      // light count and forces a full shader recompile for every lit material
      L.visible = true;
      L.intensity = fed && podsOn ? 1.4 : 0;
      L.distance = 38;
    }
    nightRig.lamp.visible = !!state.hasTools;
    nightRig.lamp.intensity = fed && !low ? 0.7 : 2.5;
  }
  applyGennyVisual(fed && !transferred, low);
  updateGennyHud();
}

function applyGennyVisual(running, low) {
  const g = state.genny;
  if (!g || !g.userData) return;
  const ud = g.userData;
  if (ud.flood) {
    ud.flood.visible = !!running;
    ud.flood.intensity = low ? 0.8 : 3.4;
  }
  if (ud.fill) {
    ud.fill.visible = !!running;
    ud.fill.intensity = low ? 0.4 : 1.6;
  }
  if (ud.glow) {
    ud.glow.visible = !!running;
    ud.glow.material.opacity = running ? (low ? 0.25 : 0.45) : 0;
  }
  if (ud.led) {
    ud.led.material.color.setHex(running ? (low ? 0xff8a1a : 0x4cff6a) : 0xff2a2a);
    ud.led.material.emissive.setHex(running ? (low ? 0xff8a1a : 0x2aff4a) : 0xff2a2a);
    ud.led.material.emissiveIntensity = running ? (low ? 0.7 : 1.2) : 0.9;
  }
  if (ud.stack) {
    ud.stack.material.emissive.setHex(running ? 0x331800 : 0x000000);
    ud.stack.material.emissiveIntensity = running ? (low ? 0.2 : 0.55) : 0;
  }
}

function updateGennyHud() {
  const wrap = $("genny-wrap");
  if (!wrap) return;
  if (cycleDay(day) !== 4) {
    wrap.classList.add("hidden");
    return;
  }
  wrap.classList.remove("hidden");
  const fill = $("gen-fill");
  const lab = $("gen-lab");
  if (dayState.genTransferred) {
    if (fill) fill.style.width = "100%";
    wrap.classList.remove("low", "dead");
    wrap.classList.add("util");
    if (lab) lab.textContent = "UTILITY";
    return;
  }
  wrap.classList.remove("util");
  const pct = Math.max(0, Math.min(1, dayState.genT / GEN_FEED));
  if (fill) fill.style.width = (pct * 100).toFixed(0) + "%";
  const dead = dayState.genT <= 0;
  const low = !dead && dayState.genT < 18;
  wrap.classList.toggle("low", low);
  wrap.classList.toggle("dead", dead);
  if (lab) lab.textContent = dead ? "DEAD" : low ? "LOW" : "DIESEL";
  if ((low || dead) && !dayState.genTransferred) {
    $("punch-hint").textContent = dead
      ? "GENNY DEAD — diesel east of the south doors"
      : "GENNY LOW — diesel east of the south doors";
    $("punch-hint").classList.remove("hidden");
  } else if (cycleDay(day) !== 6 && cycleDay(day) !== 7) {
    $("punch-hint").classList.add("hidden");
  }
}

/* shared NPC locomotion: walk toward a point, slide along walls, unstick */
function npcWalk(rec, tx, tz, sp, dt) {
  const m = rec.mesh;
  const vx = tx - m.position.x;
  const vz = tz - m.position.z;
  const dist = Math.hypot(vx, vz) || 0.001;
  if (dist < 0.7) return dist;
  let nx = m.position.x + (vx / dist) * sp * dt;
  let nz = m.position.z + (vz / dist) * sp * dt;
  for (const b of state.colliders) {
    if (b.y > 0.5) continue;
    const cx = Math.max(b.minx, Math.min(nx, b.maxx));
    const cz = Math.max(b.minz, Math.min(nz, b.maxz));
    let ddx = nx - cx;
    let ddz = nz - cz;
    const d2 = ddx * ddx + ddz * ddz;
    if (d2 < 0.16) {
      const dd = Math.sqrt(d2);
      if (dd < 1e-6) {
        // center inside the box — push out through the nearest face
        const fw = nx - b.minx, fe = b.maxx - nx, fs = nz - b.minz, fn = b.maxz - nz;
        const fm = Math.min(fw, fe, fs, fn);
        if (fm === fw) nx = b.minx - 0.401;
        else if (fm === fe) nx = b.maxx + 0.401;
        else if (fm === fs) nz = b.minz - 0.401;
        else nz = b.maxz + 0.401;
        continue;
      }
      nx += (ddx / dd) * (0.4 - dd + 0.001);
      nz += (ddz / dd) * (0.4 - dd + 0.001);
    }
  }
  m.position.x = nx;
  m.position.z = nz;
  m.rotation.y = Math.atan2(vx, vz);
  if (Math.hypot(nx - rec.lastX, nz - rec.lastZ) < sp * dt * 0.25) rec.stuck += dt;
  else rec.stuck = 0;
  rec.lastX = nx;
  rec.lastZ = nz;
  if (rec.stuck > 2.5) {
    rec.stuck = 0;
    m.position.x = tx + ((m.position.x - tx) / dist) * 10;
    m.position.z = tz + ((m.position.z - tz) / dist) * 10;
  }
  const ud = m.userData;
  if (ud && ud.legL) {
    const w = performance.now() * 0.009;
    ud.legL.rotation.x = Math.sin(w + Math.PI) * 0.55;
    ud.legR.rotation.x = Math.sin(w) * 0.55;
    ud.armL.rotation.x = Math.sin(w) * 0.4;
  }
  return dist;
}

function placeSpoolAt(x, z) {
  const placed = spoolMesh();
  placed.position.set(x, 0, z);
  placed.traverse((o) => (o.userData.noBake = true));
  scene.add(placed);
  (state.placedSpools = state.placedSpools || []).push(placed);
}

/* make a day-1 device LOOK installed without any job bookkeeping */
function dressVesda(it, on) {
  const led = it && it.mesh && it.mesh.userData && it.mesh.userData.led;
  const screen = it && it.mesh && it.mesh.userData && it.mesh.userData.screen;
  if (led) {
    led.material.emissive.setHex(on ? 0x33ff66 : 0x000000);
    led.material.emissiveIntensity = on ? 1.1 : 0;
  }
  if (screen) {
    screen.material.emissive.setHex(on ? 0x223318 : 0x000000);
    screen.material.emissiveIntensity = on ? 0.4 : 0;
  }
}

function dressInstalled(it) {
  if (it.conduit) it.conduit.visible = true;
  if (it.box) it.box.visible = true;
  if (it.smoke) setSmokeLook(it.smoke, true);
  if (it.strobe) setStrobeLook(it.strobe, true);
  if (it.vesda) dressVesda(it, true);
}

function buildDay2Items() {
  const rand = rng(state.seed || 1);
  const items = [];
  const grab = (pred) => worldItems.filter(pred);
  const meterBag = worldItems.find((i) => i.id === "tools");
  items.push({ ...meterBag, id: "tools", label: "Grab meter bag", done: false });
  for (const s of seededPick(rand, (i) => i.id === "smokes", 4)) {
    items.push({ ...s, id: "magtest", label: "Mag-test smoke", smoke: undefined, mag: true, done: false });
  }
  // troubles: 3 of the leftover boxes/strobes
  const cand = grab((i) => i.id === "boxes" || (i.id === "nac" && i.strobe) || i.id === "vesda");
  const shuffled = cand
    .map((i) => ({ i, k: rand() }))
    .sort((a, b) => a.k - b.k)
    .map((e) => e.i);
  for (const t of shuffled.slice(0, 3)) {
    const extra = t.id === "vesda" ? { forceSpec: t.vesdaKind === "fault" ? 8 : 9 } : {};
    items.push({ ...t, id: "troubles", label: "Chase trouble", box: undefined, strobe: undefined, vesda: undefined, trouble: true, ...extra, done: false });
  }
  // EOL: NAC 470Ω jumper on a leftover strobe — that's the print with the jumper tab
  const used = new Set(shuffled.slice(0, 3));
  const leftoverStrobes = grab((i) => i.strobe && !used.has(i));
  if (leftoverStrobes[0]) {
    items.push({ ...leftoverStrobes[0], id: "eol", label: "Land NAC 470Ω EOL", strobe: undefined, nacEol: true, done: false });
  } else {
    const leftoverBoxes = grab((i) => i.id === "boxes" && !used.has(i));
    if (leftoverBoxes[0]) {
      items.push({ ...leftoverBoxes[0], id: "eol", label: "Swap EOL resistor", box: undefined, eol: true, done: false });
    }
  }
  const facp = worldItems.find((i) => i.id === "facp");
  for (const h of worldItems.filter((i) => i.id === "high")) {
    items.push({ ...h, mag: true, label: "Mag the high smoke", done: false });
  }
  items.push({ ...facp, id: "facp", label: "Walk-test FACP", done: false });
  // snacks, cart, and the scissor work every day — high work NEEDS the scissor
  return items.concat(snackItems());
}

/* seeded pick of n items from a filtered set of the permanent world devices */
function seededPick(rand, pred, n) {
  return worldItems
    .filter(pred)
    .map((i) => ({ i, k: rand() }))
    .sort((a, b) => a.k - b.k)
    .map((e) => e.i)
    .slice(0, n);
}

function snackItems() {
  const tremont = getTraveler() === "tremont";
  return worldItems
    .filter((i) => {
      if (tremont && i.candy) return false; // Tremont does not run the candy bag
      return i.coffee || i.tender || i.candy || i.cartGrab || i.liftDrive || i.andyFund;
    })
    .map((i) => {
      const copy = { ...i, done: false };
      if (tremont && copy.cartGrab) copy.label = "Push the cart";
      return copy;
    });
}

function toolsItem(label) {
  const t = worldItems.find((i) => i.id === "tools");
  return { ...t, id: "tools", label, done: false };
}

function buildDay3Items() {
  const rand = rng(state.seed || 1);
  const items = [toolsItem("Grab the walk sheet")];
  for (const d of seededPick(rand, (i) => i.id === "smokes" || i.id === "nac", 4)) {
    items.push({ ...d, id: "demos", label: "Demo for the AHJ", smoke: undefined, strobe: undefined, pull: false, demo: true, done: false });
  }
  const facp = worldItems.find((i) => i.id === "facp");
  items.push({ ...facp, id: "facp", label: "Final acceptance", done: false });
  return items.concat(snackItems());
}

function buildDay4Items() {
  const rand = rng(state.seed || 1);
  const items = [toolsItem("Grab the lamp")];
  for (const d of worldItems.filter((i) => i.id === "nac" && i.strobe)) {
    items.push({ ...d, id: "batteries", label: "Test battery backup", strobe: undefined, pull: false, battery: true, batteryStrobe: d.strobe, done: false });
  }
  for (const d of seededPick(rand, (i) => i.id === "smokes", 2)) {
    items.push({ ...d, id: "ducts", label: "Reset duct detector", smoke: undefined, mag: true, done: false });
  }
  const facp = worldItems.find((i) => i.id === "facp");
  for (const h of worldItems.filter((i) => i.id === "high")) {
    items.push({ ...h, mag: true, duct: true, label: "Reset the high duct", done: false });
  }
  items.push({ ...facp, id: "facp", label: "Transfer to normal power", done: false });
  if (state.genny) items.push({ id: "genny", mesh: state.genny, x: state.genny.position.x, z: state.genny.position.z, label: "Feed the genny", genny: true, done: false });
  return items.concat(snackItems());
}

function buildDay5Items() {
  const rand = rng(state.seed || 1);
  const items = [toolsItem("Grab the tugger rope")];
  if (state.reelRack) {
    items.push({ id: "reels", mesh: state.reelRack, x: state.reelRack.position.x, z: state.reelRack.position.z, label: "Shoulder a reel", reelSrc: true, done: false });
  }
  for (let i = 0; i < 3; i++) {
    const { mid } = podBand(i);
    const mk = worldItems.find((w) => w.id === "boxes" && Math.abs(w.z - (mid - 3)) < 4 && w.x < 0);
    items.push({ id: "reels", mesh: (mk && mk.mesh) || null, x: CB.corX, z: mid + 1, label: "Drop the reel", reelTarget: true, marker: mk ? mk.marker : null, done: false });
  }
  for (const c of seededPick(rand, (i) => i.id === "conduit", 3)) {
    items.push({ ...c, id: "pulls", label: "Pull this section", conduit: undefined, pullGame: true, done: false });
  }
  const facp = worldItems.find((i) => i.id === "facp");
  items.push({ ...facp, id: "term", label: "Land the riser", eol: true, done: false });
  return items.concat(snackItems());
}

const PUNCH_FLAVOR = {
  smokes: "smoke's sitting crooked",
  boxes: "box cover's missing",
  conduit: "strap's loose on the red pipe",
  nac: "candela tag's wrong",
  vesda: "fault contacts were left de-energized",
};
const PUNCH_FLAVOR_POWER = {
  smokes: "fixture's sitting crooked",
  boxes: "box cover's missing",
  conduit: "strap's loose on the EMT",
  nac: "device tag's wrong",
};

function buildDay6Items() {
  const rand = rng(state.seed || 1);
  const items = [toolsItem("Grab the punch list")];
  for (const d of seededPick(rand, (i) => ["smokes", "boxes", "conduit", "nac"].includes(i.id), 5)) {
    items.push({
      ...d,
      id: "punch",
      label: "Clear punch item",
      smoke: undefined, strobe: undefined, box: undefined, conduit: undefined, pull: false,
      punch: true,
      hint: zoneName(d.x, d.z) + " — " + ((isTremont() ? PUNCH_FLAVOR_POWER : PUNCH_FLAVOR)[d.id] || "something's off"),
      done: false,
    });
  }
  for (const h of worldItems.filter((i) => i.id === "high")) {
    items.push({ ...h, label: "Punch: high candela", done: false });
  }
  const mkD6 = marker(0xff6a1a);
  mkD6.visible = false;
  scene.add(mkD6);
  mkD6.traverse((o) => (o.userData.noBake = true));
  items.push({
    id: "sign",
    mesh: state.drew ? state.drew.mesh : null,
    x: DREW_PATROL[0][0],
    z: DREW_PATROL[0][1],
    label: "Get Drew's sign-off",
    sign: true,
    marker: mkD6,
    done: false,
  });
  return items.concat(snackItems());
}

function buildDay7Items() {
  const rand = rng(state.seed || 1);
  const items = [toolsItem("Grab your good pen")];
  for (const d of seededPick(rand, (i) => ["smokes", "boxes", "nac"].includes(i.id), 4)) {
    items.push({ ...d, id: "checks", label: "Final check", smoke: undefined, strobe: undefined, box: undefined, pull: false, check: true, done: false });
  }
  const mkL = marker(0xd6f04a);
  const mkD = marker(0xff6a1a);
  const mkA = marker(0x4a9eff);
  for (const m of [mkL, mkD, mkA]) {
    m.visible = false;
    scene.add(m);
    m.traverse((o) => (o.userData.noBake = true));
  }
  items.push({ id: "signoffs", mesh: null, x: CB.corX, z: CB.z0 + 6, label: foremanName() + "'s sign-off", sign: "lugo", marker: mkL, done: false });
  items.push({ id: "signoffs", mesh: null, x: -26, z: 12, label: "Drew's sign-off", sign: "drew", marker: mkD, done: false });
  items.push({ id: "signoffs", mesh: null, x: 2, z: 8, label: isTremont() ? "Inspector's sign-off" : "AHJ's sign-off", sign: "ahj", marker: mkA, done: false });
  const facp = worldItems.find((i) => i.id === "facp");
  items.push({ ...facp, id: "facp", label: "ENERGIZE", done: false });
  return items.concat(snackItems());
}

function buildDay8Items() {
  const rand = rng(state.seed || 1);
  const items = [toolsItem("Grab pouch")];
  for (const c of seededPick(rand, (i) => i.id === "conduit", 4)) {
    if (c.conduit) c.conduit.visible = false;
    if (c.marker) c.marker.visible = true;
    items.push({ ...c, id: "conduit", label: isTremont() ? "Extend EMT" : "Extend the loop", done: false });
  }
  for (const b of seededPick(rand, (i) => i.id === "boxes", 3)) {
    if (b.box) b.box.visible = false;
    if (b.marker) b.marker.visible = true;
    items.push({ ...b, id: "boxes", label: "Mount isolator", done: false });
  }
  for (const s of seededPick(rand, (i) => i.id === "smokes", 3)) {
    items.push({ ...s, id: "magtest", label: isTremont() ? "Meg last week's run" : "Verify last week's loop", smoke: undefined, mag: true, done: false });
  }
  if (!isTremont()) {
    const v = seededPick(rand, (i) => i.id === "vesda", 1)[0];
    if (v) {
      dressVesda(v, false);
      if (v.marker) v.marker.visible = true;
      items.push({ ...v, id: "vesda", label: "Land aux expander", done: false });
    }
  }
  const facp = worldItems.find((i) => i.id === "facp");
  items.push({ ...facp, id: "facp", label: isTremont() ? "Add the feeder card" : "Add the loop card", done: false });
  return items.concat(snackItems());
}

function buildDay9Items() {
  const rand = rng(state.seed || 1);
  const items = [toolsItem("Grab meter bag")];
  for (const s of seededPick(rand, (i) => i.id === "smokes", 6)) {
    items.push({ ...s, id: "magtest", label: isTremont() ? "Retest feeder" : "Retest smoke", smoke: undefined, mag: true, done: false });
  }
  const used = new Set();
  for (const t of seededPick(rand, (i) => i.id === "boxes" || (i.id === "nac" && i.strobe) || i.id === "vesda", 2)) {
    used.add(t);
    const extra = t.id === "vesda" ? { forceSpec: t.vesdaKind === "fault" ? 8 : 9 } : {};
    items.push({ ...t, id: "troubles", label: isTremont() ? "Chase leftover open" : "Chase leftover trouble", box: undefined, strobe: undefined, vesda: undefined, trouble: true, ...extra, done: false });
  }
  const facp = worldItems.find((i) => i.id === "facp");
  for (const h of worldItems.filter((i) => i.id === "high")) {
    items.push({ ...h, mag: true, label: isTremont() ? "Meg the high fixture" : "Mag the high smoke", done: false });
  }
  items.push({ ...facp, id: "facp", label: isTremont() ? "Walk-test gear" : "Walk-test FACP", done: false });
  return items.concat(snackItems());
}

function buildDay10Items() {
  const rand = rng(state.seed || 1);
  const items = [toolsItem("Grab the walk sheet")];
  for (const d of seededPick(rand, (i) => i.id === "smokes" || i.id === "nac", 6)) {
    items.push({ ...d, id: "demos", label: "Demo for the return walk", smoke: undefined, strobe: undefined, pull: false, demo: true, done: false });
  }
  const facp = worldItems.find((i) => i.id === "facp");
  items.push({ ...facp, id: "facp", label: "Final acceptance", done: false });
  return items.concat(snackItems());
}

function buildDay11Items() {
  const rand = rng(state.seed || 1);
  const items = [toolsItem("Grab the lamp")];
  for (const d of worldItems.filter((i) => i.id === "nac" && i.strobe)) {
    items.push({ ...d, id: "batteries", label: isTremont() ? "Test emergency light" : "Test battery backup", strobe: undefined, pull: false, battery: true, batteryStrobe: d.strobe, done: false });
  }
  for (const d of seededPick(rand, (i) => i.id === "smokes", 3)) {
    items.push({ ...d, id: "ducts", label: isTremont() ? "Reset occupancy sensor" : "Reset duct detector", smoke: undefined, mag: true, done: false });
  }
  const facp = worldItems.find((i) => i.id === "facp");
  for (const h of worldItems.filter((i) => i.id === "high")) {
    items.push({ ...h, mag: true, duct: true, label: isTremont() ? "Reset the high sensor" : "Reset the high duct", done: false });
  }
  items.push({ ...facp, id: "facp", label: "Transfer to normal power", done: false });
  if (state.genny) items.push({ id: "genny", mesh: state.genny, x: state.genny.position.x, z: state.genny.position.z, label: "Feed the genny", genny: true, done: false });
  return items.concat(snackItems());
}

function buildDay12Items() {
  const rand = rng(state.seed || 1);
  const items = [toolsItem("Grab the tugger rope")];
  if (state.reelRack) {
    items.push({ id: "reels", mesh: state.reelRack, x: state.reelRack.position.x, z: state.reelRack.position.z, label: "Shoulder a reel", reelSrc: true, done: false });
  }
  for (let i = 0; i < 4; i++) {
    const { mid } = podBand(i);
    const mk = worldItems.find((w) => w.id === "boxes" && Math.abs(w.z - (mid - 3)) < 4 && w.x < 0);
    items.push({ id: "reels", mesh: (mk && mk.mesh) || null, x: CB.corX, z: mid + 1, label: "Drop the reel", reelTarget: true, marker: mk ? mk.marker : null, done: false });
  }
  for (const c of seededPick(rand, (i) => i.id === "conduit", 4)) {
    items.push({ ...c, id: "pulls", label: "Pull feeder two", conduit: undefined, pullGame: true, done: false });
  }
  const facp = worldItems.find((i) => i.id === "facp");
  items.push({ ...facp, id: "term", label: isTremont() ? "Land feeder two" : "Land feeder two", eol: true, done: false });
  return items.concat(snackItems());
}

function buildDay13Items() {
  const rand = rng(state.seed || 1);
  const items = [toolsItem("Grab the punch list")];
  for (const d of seededPick(rand, (i) => ["smokes", "boxes", "conduit", "nac"].includes(i.id), 7)) {
    items.push({
      ...d,
      id: "punch",
      label: "Clear callback",
      smoke: undefined, strobe: undefined, box: undefined, conduit: undefined, pull: false,
      punch: true,
      hint: zoneName(d.x, d.z) + " — " + ((isTremont() ? PUNCH_FLAVOR_POWER : PUNCH_FLAVOR)[d.id] || "callback from last week"),
      done: false,
    });
  }
  for (const h of worldItems.filter((i) => i.id === "high")) {
    items.push({ ...h, label: isTremont() ? "Callback: high fixture" : "Callback: high candela", done: false });
  }
  const mkD13 = marker(0xff6a1a);
  mkD13.visible = false;
  scene.add(mkD13);
  mkD13.traverse((o) => (o.userData.noBake = true));
  items.push({
    id: "sign",
    mesh: state.drew ? state.drew.mesh : null,
    x: DREW_PATROL[0][0],
    z: DREW_PATROL[0][1],
    label: "Get Drew's sign-off",
    sign: true,
    marker: mkD13,
    done: false,
  });
  return items.concat(snackItems());
}

function buildDay14Items() {
  const rand = rng(state.seed || 1);
  const items = [toolsItem("Grab your good pen")];
  for (const d of seededPick(rand, (i) => ["smokes", "boxes", "nac"].includes(i.id), 6)) {
    items.push({ ...d, id: "checks", label: "Turnover check", smoke: undefined, strobe: undefined, box: undefined, pull: false, check: true, done: false });
  }
  const mkL = marker(0xd6f04a);
  const mkD = marker(0xff6a1a);
  const mkA = marker(0x4a9eff);
  for (const m of [mkL, mkD, mkA]) {
    m.visible = false;
    scene.add(m);
    m.traverse((o) => (o.userData.noBake = true));
  }
  items.push({ id: "signoffs", mesh: null, x: CB.corX, z: CB.z0 + 6, label: foremanName() + "'s sign-off", sign: "lugo", marker: mkL, done: false });
  items.push({ id: "signoffs", mesh: null, x: -26, z: 12, label: "Drew's sign-off", sign: "drew", marker: mkD, done: false });
  items.push({ id: "signoffs", mesh: null, x: 2, z: 8, label: isTremont() ? "Inspector's sign-off" : "AHJ's sign-off", sign: "ahj", marker: mkA, done: false });
  const facp = worldItems.find((i) => i.id === "facp");
  items.push({ ...facp, id: "facp", label: "ENERGIZE", done: false });
  return items.concat(snackItems());
}


const STORE_BOX = { x: CB.elecWX, z: CB.zPod0 + 4 }; // west electrical, south section

function ensureStoreBox() {
  if (state.storeBoxMesh) return;
  placeBox(STORE_BOX.x, 0, STORE_BOX.z, 1.5, 1.05, 0.95, mats.dark, true);
  const lid = boxMesh(1.52, 0.08, 0.98, mat(0xff6a1a));
  lid.position.set(STORE_BOX.x, 1.08, STORE_BOX.z);
  scene.add(lid);
  const tag = makeNameTag("GANG BOX", "DRIP · PTS");
  tag.scale.set(2.2, 0.55, 1);
  tag.position.set(STORE_BOX.x, 2.15, STORE_BOX.z);
  scene.add(tag);
  state.storeBoxMesh = true;
}

function storeInteractable() {
  return {
    id: "store",
    mesh: null,
    x: STORE_BOX.x,
    z: STORE_BOX.z,
    label: "Open the gang box",
    store: true,
    done: false,
  };
}

/* set the world + interactable list to match the current day */
function rebuildDayItems() {
  // drop leftover day-7 sign diamonds so a re-run doesn't stack them
  for (const it of state.interactables || []) {
    if (it.sign && it.marker && it.marker.parent) {
      it.marker.parent.remove(it.marker);
      it.marker.geometry?.dispose?.();
      it.marker.material?.dispose?.();
    }
  }
  // clear day-3's blue/orange repaints and last run's leftover spools
  for (const it of worldItems) {
    if (it.marker) it.marker.material.color.setHex(it.marker.userData.baseColor ?? 0xff5a4a);
  }
  for (const sp of state.placedSpools || []) sp.parent?.remove(sp);
  state.placedSpools = [];
  if (day === 1) {
    const tremont = getTraveler() === "tremont";
    state.interactables = worldItems
      .filter((i) => !i.store && !(tremont && i.candy))
      .map((i) => {
        if (tremont && i.cartGrab) return { ...i, label: "Push the cart" };
        return i;
      })
      .concat([storeInteractable(), ...utvInteractables()]);
    for (const it of worldItems) resetItem(it);
    ensureStoreBox();
    return;
  }
  for (const it of worldItems) {
    dressInstalled(it);
    if (it.marker) it.marker.visible = false;
    if ((it.id === "tools" || it.coffee || it.tender) && it.mesh) it.mesh.visible = true;
  }
  const builders = {
    2: buildDay2Items, 3: buildDay3Items, 4: buildDay4Items, 5: buildDay5Items, 6: buildDay6Items, 7: buildDay7Items,
    8: buildDay8Items, 9: buildDay9Items, 10: buildDay10Items, 11: buildDay11Items, 12: buildDay12Items, 13: buildDay13Items, 14: buildDay14Items,
  };
  const c = cycleDay(day);
  const fn = builders[day] || builders[c] || buildDay2Items;
  state.interactables = fn().concat([storeInteractable(), ...utvInteractables()]);
  for (const it of state.interactables) {
    it.done = false;
    if (it.marker) it.marker.visible = c === 6 && it.punch ? false : true;
  }
  ensureStoreBox();
}

const CREW = {
  gf: { hat: 0xffffff, shirt: 0x00338d, vest: 0xc6e03c, jeans: 0x1a2744, decal: 0xc60c30 },
  joe: { hat: 0xf4f1ea, shirt: 0x3a2418, vest: 0xc6e03c, jeans: 0x5c5346, decal: 0xc62828 },
  chris: { hat: 0xffffff, shirt: 0x1b2a4a, vest: 0xc6e03c, jeans: 0x2e2a26, decal: 0xc60c30 },
  foreman: { hat: 0xf4f1ea, shirt: 0xc8b088, vest: 0xd6e33c, jeans: 0x2e2a26, decal: 0xff6a1a },
  ahj: { hat: 0xffffff, shirt: 0xd8e2ea, vest: 0xff8a3a, jeans: 0x4a4a52, decal: 0x1565c0 },
  oconnell: { hat: 0xf4f1ea, shirt: 0x1e3a6e, vest: 0xc6e03c, jeans: 0x2f4a6e, decal: 0x1565c0 },
  ferguson: { hat: 0xf5d76e, shirt: 0x1c1c1c, vest: 0xe85d04, jeans: 0x3b5678, decal: 0xe85d04 },
  pipe: { hat: 0x2e7d32, shirt: 0x546e7a, vest: 0xf0d23c, jeans: 0x37474f, decal: 0x2e7d32 },
  labor: { hat: 0xff6a1a, shirt: 0x6d4c41, vest: 0xc6e03c, jeans: 0x3b5678, decal: 0xff6a1a },
  nate: { hat: 0xff6a1a, shirt: 0x5c3317, vest: 0xc6e03c, jeans: 0x2a2a28, decal: 0xc60c30 },
  kenny: { hat: 0xff2d55, shirt: 0xffcc00, vest: 0x5ac8fa, jeans: 0x1a1a1a, decal: 0xaf52de },
  safety: { hat: 0xf4f1ea, shirt: 0x1a365d, vest: 0xff6a1a, jeans: 0x2a2a32, decal: 0xc62828 },
  redbeard: { hat: 0xc62828, shirt: 0x4a1515, vest: 0xc6e03c, jeans: 0x1a1a1a, decal: 0xc62828 },
  andy: { hat: 0xf4f1ea, shirt: 0x1565c0, vest: 0xc6e03c, jeans: 0x2e2a26, decal: 0xc60c30 },
  millwright: { hat: 0xd4a017, shirt: 0x3e2723, vest: 0xc6e03c, jeans: 0x212121, decal: 0xd4a017 },
  insulator: { hat: 0xf4f1ea, shirt: 0xe8e0d4, vest: 0xf0d23c, jeans: 0x90a4ae, decal: 0x90caf9 },
  cleaner: { hat: 0x4fc3f7, shirt: 0x0277bd, vest: 0xc6e03c, jeans: 0x37474f, decal: 0x29b6f6 },
};
const SKINS = [0xc6865a, 0x8d5524, 0xe0ac69, 0xb07d62];
const HAIRS = [0x3a2a22, 0x1a1a1a, 0x6b4423, 0x4a3428, 0xe8d48a];

function makeWorker(kitName, opts = {}) {
  const kit = CREW[kitName] || CREW.labor;
  const skin = SKINS[opts.skin || 0];
  const hairC = HAIRS[opts.hair || 0];
  const g = new THREE.Group();
  const torso = boxMesh(0.44, 0.5, 0.24, mat(kit.shirt));
  torso.position.set(0, 1.16, 0);
  g.add(torso);
  const vestH = kitName === "gf" ? 0.36 : 0.48;
  const vest = boxMesh(0.5, vestH, 0.28, mat(kit.vest));
  vest.position.set(0, kitName === "gf" ? 1.22 : 1.18, 0);
  g.add(vest);
  const stripe = boxMesh(0.52, 0.05, 0.3, mat(0xd8dce0));
  stripe.position.set(0, kitName === "gf" ? 1.3 : 1.26, 0);
  g.add(stripe);
  if (kitName === "kenny") {
    vest.visible = false;
    stripe.visible = false;
    const dyes = [0xff2d55, 0x5ac8fa, 0xffcc00, 0x34c759, 0xaf52de, 0xff6a1a];
    dyes.forEach((c, i) => {
      const p = boxMesh(0.2, 0.15, 0.27, mat(c));
      p.position.set(-0.12 + (i % 2) * 0.24, 1.02 + Math.floor(i / 2) * 0.14, 0.03);
      g.add(p);
    });
  }
  if (kitName === "safety") {
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), mat(hairC));
    tail.position.set(0, 1.52, -0.14);
    g.add(tail);
    const tail2 = boxMesh(0.055, 0.18, 0.055, mat(hairC));
    tail2.position.set(0, 1.4, -0.16);
    g.add(tail2);
  }
  if (kitName === "redbeard") {
    const beard = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), mat(0xb71c1c));
    beard.scale.set(1.1, 0.95, 0.95);
    beard.position.set(0, 1.42, 0.1);
    g.add(beard);
    const stache = boxMesh(0.18, 0.045, 0.07, mat(0x8b1515));
    stache.position.set(0, 1.5, 0.15);
    g.add(stache);
    const point = boxMesh(0.08, 0.16, 0.08, mat(0xb71c1c));
    point.position.set(0, 1.3, 0.14);
    g.add(point);
  }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), mat(skin));
  head.position.set(0, 1.56, 0);
  g.add(head);
  let faceSrc = FACE_SRC[kitName];
  if (kitName === "foreman") {
    faceSrc = getTraveler() === "tremont" ? FACE_SRC.lemon : FACE_SRC.lugo;
  }
  if (faceSrc) {
    const ftex = loader.load(faceSrc);
    ftex.colorSpace = THREE.SRGBColorSpace;
    const face = new THREE.Mesh(
      new THREE.CircleGeometry(0.128, 24),
      new THREE.MeshBasicMaterial({ map: ftex, transparent: true, depthWrite: true })
    );
    face.position.set(0, 1.565, 0.15);
    face.userData.noBake = true;
    g.add(face);
  }
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.155, 8, 8, 0, Math.PI * 2, 0, Math.PI * 0.5),
    mat(hairC)
  );
  hair.position.set(0, 1.6, 0);
  g.add(hair);
  if (kitName === "gf") {
    // Drew's Bills cap from the photo — charcoal crown, red bill, white buffalo
    const crown = new THREE.Mesh(
      new THREE.SphereGeometry(0.165, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.58),
      mat(0x1c1c1c)
    );
    crown.position.set(0, 1.68, 0);
    g.add(crown);
    const bill = boxMesh(0.2, 0.018, 0.13, mat(0xc62828));
    bill.position.set(0, 1.61, 0.15);
    g.add(bill);
    const under = boxMesh(0.18, 0.008, 0.11, mat(0x8a8a8a));
    under.position.set(0, 1.6, 0.15);
    g.add(under);
    const buffalo = boxMesh(0.07, 0.055, 0.012, mat(0xf4f1ea));
    buffalo.position.set(0, 1.71, 0.13);
    g.add(buffalo);
    const hornL = boxMesh(0.02, 0.03, 0.01, mat(0xf4f1ea));
    hornL.position.set(-0.04, 1.74, 0.13);
    g.add(hornL);
    const hornR = hornL.clone();
    hornR.position.x = 0.04;
    g.add(hornR);
    const chain = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.01, 6, 14), mat(0xd4af37));
    chain.rotation.x = 1.15;
    chain.position.set(0, 1.4, 0.06);
    g.add(chain);
  } else {
    const hat = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(kit.hat));
    hat.position.set(0, 1.68, 0);
    g.add(hat);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 10), mat(kit.hat));
    brim.position.set(0, 1.62, 0);
    g.add(brim);
    const decal = boxMesh(0.05, 0.035, 0.01, mat(kit.decal));
    decal.position.set(0, 1.74, 0.13);
    g.add(decal);
    if (kitName !== "pipe") {
      const lamp = boxMesh(0.06, 0.04, 0.05, mat(0x222));
      lamp.position.set(0.06, 1.74, 0.13);
      g.add(lamp);
    }
  }
  if (kitName === "chris") {
    // Chris — O'Connell lighting, Long Island, blonde combover, long red tie
    const comb = new THREE.Mesh(
      new THREE.SphereGeometry(0.162, 8, 8, 0, Math.PI * 2, 0, Math.PI * 0.52),
      mat(0xe8d48a)
    );
    comb.position.set(0.02, 1.62, 0.02);
    comb.scale.set(1.05, 0.55, 1.15);
    g.add(comb);
    const tie = boxMesh(0.07, 0.42, 0.03, mat(0xc60c30));
    tie.position.set(0, 1.08, 0.16);
    g.add(tie);
    const knot = boxMesh(0.08, 0.06, 0.04, mat(0xa01020));
    knot.position.set(0, 1.32, 0.16);
    g.add(knot);
    const flag = boxMesh(0.06, 0.04, 0.012, mat(0x1a3a8a));
    flag.position.set(-0.05, 1.74, 0.145);
    g.add(flag);
    const star = boxMesh(0.03, 0.02, 0.013, mat(0xf4f1ea));
    star.position.set(-0.05, 1.75, 0.15);
    g.add(star);
  }
  function limb(w, h, d, color, x, y) {
    const m = boxMesh(w, h, d, mat(color));
    const hold = new THREE.Group();
    hold.position.set(x, y, 0);
    m.position.y = -h / 2;
    hold.add(m);
    g.add(hold);
    return hold;
  }
  const armL = limb(0.11, 0.44, 0.11, skin, 0.32, 1.38);
  const armR = limb(0.11, 0.44, 0.11, skin, -0.32, 1.38);
  const legL = limb(0.15, 0.54, 0.15, kit.jeans, 0.11, 0.9);
  const legR = limb(0.15, 0.54, 0.15, kit.jeans, -0.11, 0.9);
  const boot = mat(0x4a3424);
  const bL = boxMesh(0.16, 0.12, 0.22, boot);
  bL.position.set(0, -0.54, 0.03);
  legL.add(bL);
  const bR = bL.clone();
  legR.add(bR);
  const pouch = boxMesh(0.16, 0.18, 0.1, mat(0x5a3a22));
  pouch.position.set(0.2, 0.94, 0.12);
  g.add(pouch);
  if (kitName === "gf") {
    // Buffalo Bills jersey under the hi-vis — royal body, red/white sleeve stripes
    const BILLS_BLUE = 0x00338d;
    const BILLS_RED = 0xc60c30;
    const BILLS_WHITE = 0xf4f1ea;
    for (const arm of [armL, armR]) {
      const sleeve = boxMesh(0.145, 0.24, 0.145, mat(BILLS_BLUE));
      sleeve.position.set(0, -0.08, 0);
      arm.add(sleeve);
      const red = boxMesh(0.155, 0.04, 0.155, mat(BILLS_RED));
      red.position.set(0, -0.18, 0);
      arm.add(red);
      const white = boxMesh(0.155, 0.022, 0.155, mat(BILLS_WHITE));
      white.position.set(0, -0.21, 0);
      arm.add(white);
    }
    const collar = boxMesh(0.3, 0.07, 0.26, mat(BILLS_WHITE));
    collar.position.set(0, 1.4, 0.02);
    g.add(collar);
    const collarRed = boxMesh(0.32, 0.028, 0.27, mat(BILLS_RED));
    collarRed.position.set(0, 1.355, 0.02);
    g.add(collarRed);
    const hem = boxMesh(0.46, 0.14, 0.26, mat(BILLS_BLUE));
    hem.position.set(0, 0.94, 0);
    g.add(hem);
    const hemRed = boxMesh(0.47, 0.03, 0.27, mat(BILLS_RED));
    hemRed.position.set(0, 0.875, 0);
    g.add(hemRed);
    const num = boxMesh(0.14, 0.1, 0.02, mat(BILLS_WHITE));
    num.position.set(0, 0.95, 0.14);
    g.add(num);
    const numBar = boxMesh(0.04, 0.1, 0.021, mat(BILLS_RED));
    numBar.position.set(0, 0.95, 0.145);
    g.add(numBar);
  }
  if (opts.hold === "pipe") {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.6, 6), mats.copper);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(0, -0.42, 0.15);
    armR.add(pipe);
    armR.rotation.x = -0.35;
  }
  if (opts.hold === "drill") {
    const d = boxMesh(0.08, 0.18, 0.08, mat(0x222));
    d.position.set(0, -0.48, 0.08);
    armR.add(d);
    armR.rotation.x = -0.9;
  }
  if (opts.hold === "wrench") {
    const w = boxMesh(0.06, 0.28, 0.06, mat(0x9e9e9e));
    w.position.set(0, -0.5, 0.04);
    armR.add(w);
    armR.rotation.x = -0.7;
  }
  if (opts.hold === "wrap") {
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.28, 8), mat(0xf5f5f0));
    roll.position.set(0, -0.42, 0.08);
    armR.add(roll);
    armR.rotation.x = -0.5;
  }
  if (opts.hold === "broom") {
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 5), mats.wood);
    stick.position.set(0, -0.7, 0.05);
    armR.add(stick);
    armR.rotation.x = 0.35;
  }
  if (opts.hold === "radio") {
    const wt = boxMesh(0.06, 0.14, 0.05, mat(0x1a1a1a));
    wt.position.set(0, -0.4, 0.1);
    armR.add(wt);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 4), mat(0x111111));
    ant.position.set(0, -0.3, 0.1);
    armR.add(ant);
    armR.rotation.x = -1.25; // walkie up, mid-transmission
  }
  if (opts.hold === "clipboard") {
    const board = boxMesh(0.02, 0.3, 0.22, mat(0x8a6a3a));
    board.position.set(0, -0.4, 0.12);
    board.rotation.x = -0.4;
    armR.add(board);
    const paper = boxMesh(0.015, 0.24, 0.17, mat(0xf2efe4));
    paper.position.set(-0.012, -0.4, 0.12);
    paper.rotation.x = -0.4;
    armR.add(paper);
    const slip = boxMesh(0.014, 0.07, 0.15, mat(0xf0a8b8));
    slip.position.set(-0.024, -0.32, 0.12);
    slip.rotation.x = -0.4;
    armR.add(slip);
    armR.rotation.x = -0.55;
  }
  if (opts.beard) {
    const bd = new THREE.Mesh(new THREE.SphereGeometry(0.095, 8, 8), mat(0x6b4a28));
    bd.scale.set(1, 0.7, 0.7);
    bd.position.set(0, 1.47, 0.09);
    g.add(bd);
  }
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(0.32, 10),
    new THREE.MeshBasicMaterial({ color: 0x000, transparent: true, opacity: 0.28 })
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.02;
  g.add(blob);
  mergeLambertChildren(g);
  for (const h of [armL, armR, legL, legR]) mergeLambertChildren(h);

  g.userData = { armL, armR, legL, legR };
  return g;
}

function placeWorker(kit, x, z, yaw, extra = {}) {
  const w = makeWorker(kit, extra);
  w.position.set(x, extra.y || 0, z);
  w.rotation.y = yaw || 0;
  scene.add(w);
  w.traverse((o) => (o.userData.noBake = true));
  state.crew.push({
    mesh: w,
    kit,
    hold: extra.hold || null,
    path: extra.path || null,
    i: 0,
    u: 0,
    speed: extra.speed || 1.55,
    phase: Math.random() * 10,
    work: extra.work || false,
    lift: extra.lift || false,
    joeGuy: extra.joeGuy || false,
    followLift: extra.followLift || false,
    said: false,
  });
  return w;
}

let scissorReturn = null; // last-built lift group, for the drivable one
function scissorLift(x, z, yaw, height, color, kit, rise) {
  const col = mat(color);
  const g = new THREE.Group();
  const base = boxMesh(1.35, 0.42, 2.5, col);
  base.position.y = 0.28;
  g.add(base);
  for (const [wx, wz] of [
    [-0.5, 0.95],
    [0.5, 0.95],
    [-0.5, -0.95],
    [0.5, -0.95],
  ]) {
    const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.14, 8), mats.dark);
    wh.rotation.z = Math.PI / 2;
    wh.position.set(wx, 0.16, wz);
    g.add(wh);
  }
  const h = Math.max(0.9, height);
  const sc = new THREE.Group();
  sc.position.y = 0.48;
  const span = Math.max(0.5, h - 0.55);
  const ang = 0.52;
  const barLen = span / Math.cos(ang);
  for (const side of [-0.4, 0.4]) {
    for (const bay of [-0.55, 0.55]) {
      const a = boxMesh(0.08, barLen, 0.08, mats.dark);
      a.position.set(side, span * 0.5, bay);
      a.rotation.z = ang;
      const b = a.clone();
      b.rotation.z = -ang;
      sc.add(a, b);
    }
  }
  g.add(sc);
  const plat = new THREE.Group();
  plat.position.y = h;
  plat.add(boxMesh(1.32, 0.1, 2.35, col));
  for (const [px, pz, sx, sz] of [
    [0, 1.12, 1.28, 0.06],
    [0, -1.12, 1.28, 0.06],
    [0.62, 0, 0.06, 2.2],
    [-0.62, 0, 0.06, 2.2],
  ]) {
    const rail = boxMesh(sx, 0.9, sz, mats.dark);
    rail.position.set(px, 0.5, pz);
    plat.add(rail);
  }
  const stripe = boxMesh(1.34, 0.06, 0.08, mat(kit === "ferguson" ? 0xe85d04 : kit === "oconnell" ? 0x1565c0 : 0x2e7d32));
  stripe.position.set(0, 0.12, 1.2);
  plat.add(stripe);
  g.add(plat);
  g.userData.liftBits = { sc, plat, span }; // the drivable one raises — see applyLift()
  if (kit) {
    const wr = makeWorker(kit, { skin: (x + z) & 3, hair: Math.abs(z) & 3, hold: kit === "pipe" ? "pipe" : "drill", lift: true });
    wr.position.set(0, 0.05, 0);
    plat.add(wr);
    state.crew.push({ mesh: wr, work: false, lift: true, phase: Math.random() * 8, path: null });
  }
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  scene.add(g);
  g.traverse((o) => (o.userData.noBake = true));
  addCollider(x, z, 1.5, 2.6, 0, 1.2);
  state.lifts.push({ mesh: g, plat, sc, h, rise: !!rise, t: Math.random() * 5 });
  scissorReturn = g;
}

/* the drivable scissor raises and lowers — deck height rides dayState.liftH */
const LIFT_STOW = 1.0; // deck height as built
const LIFT_TOP = 7.5; // full stick outdoors — about a 25-footer
function liftCeilingAt(x, z) {
  if (x > CB.west - 2 && x < CB.east + 2 && z > CB.z0 - 2 && z < CB.z1 + 2) return 8.05; // CB-4 deck
  if (x > 78 && x < 116 && z > CB.z0 && z < CB.z0 + 56) return 9.1; // CB-5 clad corner
  if (x < -56 && z > 30) return 7.4; // miner rows
  return Infinity;
}
function applyLift() {
  const L = state.driveLift && state.driveLift.mesh;
  if (!L || !L.userData.liftBits) return;
  const u = L.userData.liftBits;
  const H = LIFT_STOW + (dayState.liftH || 0);
  u.plat.position.y = H;
  u.sc.scale.y = Math.max(0.06, H - 0.55) / u.span;
}
function syncLiftBtns() {
  $("lift-btns").classList.toggle("hidden", !(dayState.driving && !dayState.utv && isCoarse()));
  $("btn-jump").classList.toggle("hidden", dayState.driving && !dayState.utv && isCoarse());
}

function groundH(x, z) {
  let h = 0;
  for (const r of state.ramps) {
    const dx = x - r.x;
    const dz = z - r.z;
    const c = Math.cos(-r.yaw);
    const s = Math.sin(-r.yaw);
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    if (Math.abs(lx) > r.wid * 0.5 || lz < -0.2 || lz > r.len + 0.2) continue;
    const t = THREE.MathUtils.clamp(lz / r.len, 0, 1);
    const hh = r.h0 + (r.h1 - r.h0) * t;
    if (hh > h) h = hh;
  }
  return h;
}

function addRamp(x, z, yaw, len, wid, h0, h1, dirt) {
  state.ramps.push({ x, z, yaw, len, wid, h0, h1 });
  const rise = h1 - h0;
  const hyp = Math.hypot(len, Math.abs(rise)) || len;
  const mesh = boxMesh(wid, 0.42, hyp, dirt);
  mesh.rotation.order = "YXZ";
  mesh.rotation.y = yaw;
  mesh.rotation.x = -Math.atan2(rise, len);
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  mesh.position.set(x + fx * (len * 0.5), (h0 + h1) * 0.5 + 0.12, z + fz * (len * 0.5));
  scene.add(mesh);
}

function buildLandfillCourse() {
  const dirt = mat(0x6b5340);
  const dirtDark = mat(0x4a3a2c);
  const rust = mat(0x8a5a32);
  const LX = -214;
  const LZ = 62;
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(64, 96), dirt);
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(LX, 0.03, LZ + 36);
  scene.add(pad);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(70, 8), dirtDark);
  road.rotation.x = -Math.PI / 2;
  road.position.set(-175, 0.04, 22);
  scene.add(road);
  const spur = new THREE.Mesh(new THREE.PlaneGeometry(8, 44), dirtDark);
  spur.rotation.x = -Math.PI / 2;
  spur.position.set(LX, 0.04, 40);
  scene.add(spur);
  // berms — keep the course in the pit
  placeBox(LX - 16, 0, LZ + 38, 4.5, 2.4, 88, dirtDark, true);
  placeBox(LX + 16, 0, LZ + 38, 4.5, 2.2, 88, dirtDark, true);
  // south berm with a GATE so the spur road can actually enter the pit
  placeBox(LX - 14, 0, LZ - 8, 12, 1.6, 4, dirtDark, true);
  placeBox(LX + 14, 0, LZ - 8, 12, 1.6, 4, dirtDark, true);
  placeBox(LX + 4, 0, LZ + 86, 28, 2.8, 5, dirtDark, true);
  addRamp(LX, LZ, 0, 12, 6.2, 0, 1.55, dirt);           // roll-in
  addRamp(LX, LZ + 12, 0, 9, 6.2, 1.55, 1.55, dirt);     // table
  addRamp(LX, LZ + 21, 0, 10, 6.2, 1.55, 0, dirt);       // down
  addRamp(LX, LZ + 36, 0, 7, 5.6, 0, 3.35, dirt);        // kicker
  addRamp(LX, LZ + 52, 0, 11, 6.4, 1.9, 0, dirt);        // landing
  addRamp(LX + 10, LZ + 64, 0.35, 8, 5.4, 0, 2.6, dirt); // step-up
  addRamp(LX + 14, LZ + 76, 0.18, 9, 6.2, 0, 4.4, dirt); // big kicker
  addRamp(LX + 16, LZ + 96, 0.08, 12, 7.2, 2.4, 0, dirt); // big landing
  // scrap piles
  for (let i = 0; i < 8; i++) {
    const junk = boxMesh(1.4 + (i % 3) * 0.7, 0.7 + (i % 2) * 0.8, 1.2 + (i % 4) * 0.4, rust);
    junk.position.set(LX - 12 + (i % 4) * 2.2, 0.5, LZ + 8 + Math.floor(i / 4) * 6);
    junk.rotation.y = i * 0.5;
    scene.add(junk);
  }
  const sign = makeLabel("LANDFILL · SXS COURSE", "#ffb020");
  sign.position.set(LX, 3.1, LZ - 14);
  scene.add(sign);
  const tip = makeLabel("GATE OPEN · JUMP · FLIP", "#d6f04a");
  tip.position.set(LX, 2.2, LZ - 14);
  scene.add(tip);
  const gate = makeLabel("SXS GATE", "#ffb020");
  gate.position.set(LX, 2.6, LZ - 6);
  scene.add(gate);
}

function makeUtv(color) {
  const g = new THREE.Group();
  const body = boxMesh(1.55, 0.72, 2.55, mat(color));
  body.position.y = 0.78;
  g.add(body);
  const nose = boxMesh(1.4, 0.38, 0.55, mat(0x1a1a1c));
  nose.position.set(0, 0.72, 1.4);
  g.add(nose);
  const bed = boxMesh(1.45, 0.32, 0.7, mat(0x2a2a28));
  bed.position.set(0, 0.95, -1.15);
  g.add(bed);
  const cageC = mat(0x222226);
  for (const [x, z] of [[-0.62, 0.85], [0.62, 0.85], [-0.62, -0.55], [0.62, -0.55]]) {
    const p = boxMesh(0.07, 1.15, 0.07, cageC);
    p.position.set(x, 1.35, z);
    g.add(p);
  }
  const roof = boxMesh(1.5, 0.06, 1.7, cageC);
  roof.position.set(0, 1.95, 0.15);
  g.add(roof);
  const bar = boxMesh(1.35, 0.08, 0.12, mat(0xf4f1ea));
  bar.position.set(0, 2.02, 0.85);
  g.add(bar);
  const seatL = boxMesh(0.42, 0.28, 0.48, mat(0x3a2218));
  seatL.position.set(-0.32, 1.05, 0.15);
  g.add(seatL);
  const seatR = seatL.clone();
  seatR.position.x = 0.32;
  g.add(seatR);
  const dashRadio = makeBoombox();
  dashRadio.scale.setScalar(0.42);
  dashRadio.position.set(0, 1.18, 0.72);
  dashRadio.rotation.y = Math.PI;
  g.add(dashRadio);
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.28, 8);
  const rubber = mat(0x1a1a1a);
  const wheels = [];
  for (const [x, z] of [[-0.78, 0.95], [0.78, 0.95], [-0.78, -0.95], [0.78, -0.95]]) {
    const w = new THREE.Mesh(wheelGeo, rubber);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.38, z);
    g.add(w);
    wheels.push(w);
  }
  g.userData.wheels = wheels;
  g.traverse((o) => (o.userData.noBake = true));
  return g;
}

function buildUtvs() {
  state.utvs = [];
  // South yard: one by the tool pouch, one at the west door on the way to the gang box
  const spots = [
    { x: 10.2, z: 16.4, yaw: 0.12, color: 0xff6a1a },
    { x: CB.elecWX, z: SPAWN.z - 2, yaw: 0.05, color: 0xc9b23a },
  ];
  for (const s of spots) {
    const mesh = makeUtv(s.color);
    mesh.position.set(s.x, 0, s.z);
    mesh.rotation.y = s.yaw;
    scene.add(mesh);
    state.utvs.push({ mesh, parked: { x: s.x, z: s.z, yaw: s.yaw } });
  }
  const tag = makeLabel("SIDE-BY-SIDES · E TO RIDE", "#ffb020");
  tag.position.set(10.2, 2.35, 16.4);
  scene.add(tag);
}

function utvInteractables() {
  return (state.utvs || []).map((u, i) => ({
    id: "utv" + i,
    mesh: u.mesh,
    x: u.mesh.position.x,
    z: u.mesh.position.z,
    label: dayState.utv === u ? "Park the side-by-side" : "Hop in the side-by-side",
    utv: true,
    utvRef: u,
    done: false,
  }));
}

function mountUtv(u) {
  if (dayState.driving && !dayState.utv) {
    toast("PARK THE SCISSOR FIRST", true);
    return;
  }
  if (dayState.carrying) {
    toast("NOT WITH A REEL ON", true);
    sfx("bad");
    return;
  }
  if (dayState.pushCart) {
    dayState.pushCart = false;
    toast("CART PARKED");
  }
  if (dayState.utv === u) {
    dayState.utv = null;
    dayState.driving = false;
    const m = u.mesh;
    player.position.set(m.position.x + 1.7, groundH(m.position.x + 1.7, m.position.z), m.position.z);
    m.rotation.x = 0;
    m.rotation.z = 0;
    toast("SXS PARKED");
    syncLiftBtns();
    sfx("pickup");
    return;
  }
  if (dayState.utv) {
    toast("YOU'RE ALREADY IN ONE", true);
    return;
  }
  dayState.utv = u;
  dayState.driving = true;
  dayState.utvHop = false;
  dayState.utvStun = 0;
  dayState.utvAir = 0;
  dayState.utvRoll = 0;
  dayState.utvPitch = 0;
  facing = u.mesh.rotation.y;
  cam.yaw = facing;
  startUtvRadio();
  toast(isCoarse() ? "SXS RADIO ON — JUMP TO SEND IT" : "SXS RADIO ON — SPACE TO JUMP · STICK TO WHIP");
  speakAs(getTraveler() === "tremont" ? "tremont" : "utah",
    getTraveler() === "tremont" ? "Ford's in the lot. This thing's for the pit." : "Side-by-side. Don't tell Drew.");
  track("utv_drive", {});
  syncLiftBtns();
  sfx("pickup");
  vib(12);
}

function trickName(roll, pitch, air) {
  const spins = Math.abs(roll) / (Math.PI * 2);
  const flips = Math.abs(pitch) / (Math.PI * 2);
  if (flips > 0.72) return "BACKFLIP";
  if (spins > 0.85) return "360";
  if (spins > 0.45) return "WHIP";
  if (air > 0.85) return "AIR";
  return "";
}

function updateUtv(dt, ix, iz, mag, fx, fz) {
  const u = dayState.utv;
  if (!u || !u.mesh) return;
  const m = u.mesh;
  if (dayState.utvStun > 0) {
    dayState.utvStun -= dt;
    m.rotation.z *= 0.9;
    m.rotation.x *= 0.9;
    player.position.set(m.position.x, m.position.y + 1.05, m.position.z);
    return;
  }
  const gh = groundH(m.position.x, m.position.z);
  const onG = m.position.y <= gh + 0.12;
  let speed = 0;
  if (onG) {
    const boost = sprintOn || keys.ShiftLeft || keys.ShiftRight;
    const throttle = THREE.MathUtils.clamp(iz, -1, 1);
    speed = (boost ? 26 : 19) * throttle;
    // inside the hall, crawl — this is a yard toy
    if (m.position.x > CB.west - 4 && m.position.x < CB.east + 4 && m.position.z > CB.z0 - 4 && m.position.z < CB.z1 + 4) {
      speed = Math.min(speed, 7);
    }
    if (mag > 0.1) {
      facing += -ix * dt * (2.6 + Math.min(8, Math.abs(speed) * 0.08));
    }
    const ffx = Math.sin(facing);
    const ffz = Math.cos(facing);
    const ahead = groundH(m.position.x + ffx * 1.1, m.position.z + ffz * 1.1);
    pvel.y = Math.max(pvel.y, (ahead - gh) * Math.max(4, speed * 0.55));
    const hit = collideXZ(m.position.x + ffx * speed * dt, m.position.z + ffz * speed * dt, 1.35, gh);
    m.position.x = hit.x;
    m.position.z = hit.z;
    if (dayState.utvHop && onG) {
      pvel.y = 7.2 + Math.min(8, Math.abs(speed) * 0.18);
      grounded = false;
      sfx("thud");
      vib(8);
    }
    dayState.utvHop = false;
    if (pvel.y <= 0.4) {
      m.position.y = gh;
      pvel.y = 0;
      grounded = true;
    } else {
      m.position.y += pvel.y * dt;
      grounded = false;
    }
    dayState.utvRoll *= 0.8;
    dayState.utvPitch *= 0.8;
    if (dayState.utvAir > 0.18) {
      const nm = trickName(dayState.utvRoll, dayState.utvPitch, dayState.utvAir);
      const clean = Math.abs(dayState.utvRoll % (Math.PI * 2)) < 0.7 || Math.abs(dayState.utvRoll % (Math.PI * 2) - Math.PI * 2) < 0.7;
      const pitchOk = Math.abs(dayState.utvPitch) < 0.85;
      if (nm && clean && pitchOk) {
        const pts = 80 + Math.round(dayState.utvAir * 90) + (nm === "BACKFLIP" ? 180 : nm === "360" ? 140 : nm === "WHIP" ? 90 : 40);
        addWatts(pts, nm);
        toast(nm + " · +" + pts);
        sfx("pickup");
      } else if (!clean || !pitchOk) {
        dayState.utvStun = 1.3;
        toast("WRECKED", true);
        sfx("bad");
        vib(18);
        pvel.y = 0;
      } else if (dayState.utvAir > 0.45) {
        addWatts(40, "AIRTIME");
      }
    }
    dayState.utvAir = 0;
    dayState.utvRoll = 0;
    dayState.utvPitch = 0;
  } else {
    dayState.utvHop = false;
    pvel.y += -16 * dt;
    const ffx = Math.sin(facing);
    const ffz = Math.cos(facing);
    const airSp = 14;
    const hit = collideXZ(m.position.x + ffx * airSp * dt + fx * 2 * dt, m.position.z + ffz * airSp * dt + fz * 2 * dt, 1.35, m.position.y);
    m.position.x = hit.x;
    m.position.z = hit.z;
    m.position.y += pvel.y * dt;
    dayState.utvAir += dt;
    dayState.utvRoll += ix * dt * 5.2;
    dayState.utvPitch += -iz * dt * 4.4;
    const gh2 = groundH(m.position.x, m.position.z);
    if (m.position.y <= gh2) {
      m.position.y = gh2;
      pvel.y = 0;
      grounded = true;
    } else grounded = false;
  }
  m.rotation.y = facing;
  m.rotation.z = dayState.utvRoll;
  m.rotation.x = dayState.utvPitch;
  const wheels = m.userData.wheels || [];
  const spin = (onG ? 19 : 10) * dt;
  for (const w of wheels) w.rotation.x += spin;
  player.position.set(m.position.x, m.position.y + 1.05, m.position.z);
  player.rotation.y = facing;
  pvel.x = pvel.z = 0;
  kick.x = kick.z = 0;
  const ud = body.userData;
  if (ud) {
    ud.armL.rotation.x = -0.55;
    ud.armR.rotation.x = -0.55;
    ud.legL.rotation.x = 0.4;
    ud.legR.rotation.x = 0.4;
  }
}


function boomLift(x, z, yaw, color, kit, swing) {
  const col = mat(color);
  const g = new THREE.Group();
  const base = boxMesh(1.7, 0.55, 2.8, col);
  base.position.y = 0.38;
  g.add(base);
  for (const [wx, wz] of [
    [-0.65, 1.05],
    [0.65, 1.05],
    [-0.65, -1.05],
    [0.65, -1.05],
  ]) {
    const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.16, 8), mats.dark);
    wh.rotation.z = Math.PI / 2;
    wh.position.set(wx, 0.2, wz);
    g.add(wh);
  }
  const turret = new THREE.Group();
  turret.position.y = 0.85;
  const house = boxMesh(1.1, 0.9, 1.2, col);
  house.position.y = 0.2;
  turret.add(house);
  const arm = new THREE.Group();
  arm.rotation.x = -0.52;
  const boom = boxMesh(0.28, 0.28, 7.2, col);
  boom.position.z = 3.5;
  arm.add(boom);
  const arm2 = new THREE.Group();
  arm2.position.z = 7.1;
  arm2.rotation.x = 0.85;
  const boom2 = boxMesh(0.22, 0.22, 5.2, col);
  boom2.position.z = 2.5;
  arm2.add(boom2);
  const basket = new THREE.Group();
  basket.position.z = 5.3;
  basket.rotation.x = -0.33;
  basket.add(boxMesh(1.15, 0.08, 0.85, col));
  for (const [bx, bz] of [
    [0.52, 0],
    [-0.52, 0],
    [0, 0.38],
    [0, -0.38],
  ]) {
    const rail = boxMesh(bx === 0 ? 1.1 : 0.06, 0.85, bz === 0 ? 0.06 : 0.8, mats.dark);
    rail.position.set(bx, 0.46, bz);
    basket.add(rail);
  }
  if (kit) {
    const wr = makeWorker(kit, { skin: 1, hair: 2, hold: "drill", lift: true });
    wr.position.set(0, 0.05, 0);
    basket.add(wr);
    state.crew.push({ mesh: wr, lift: true, work: false, phase: Math.random() * 8, path: null });
  }
  arm2.add(basket);
  arm.add(arm2);
  turret.add(arm);
  g.add(turret);
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  scene.add(g);
  g.traverse((o) => (o.userData.noBake = true));
  addCollider(x, z, 2.0, 3.0, 0, 1.4);
  state.lifts.push({ mesh: g, turret, swing: !!swing, baseYaw: 0, t: Math.random() * 8 });
}

function buildSiteTraffic() {
  // data-hall scissors — one raised stick per pod
  for (let i = 0; i < CB.pods; i++) {
    const { mid } = podBand(i);
    const kits = ["oconnell", "ferguson", "oconnell", "pipe"];
    scissorLift(CB.dataX + 12, mid - 2, 0.05, 4.0 + (i % 3) * 0.5, i % 2 ? 0x2a6fbb : 0xf0d23c, kits[i], i === 1);
  }

  // yard scissors
  scissorLift(18, 33, 0.4, 1.15, 0xf0d23c, null, false);
  scissorLift(-12, 19, -0.3, 3.4, 0x2a6fbb, "ferguson", false);
  scissorLift(15, 6, 1.2, 1.15, 0xe85d04, null, false);

  // boom lifts
  boomLift(-22, 33, 0.7, 0xf0d23c, "oconnell", true);
  boomLift(26, 41, -0.9, 0xe85d04, "ferguson", true);
  boomLift(34, 20, 2.4, 0x2a6fbb, null, false);
  boomLift(-28, 38, 0.4, 0xf0d23c, "pipe", false);
  boomLift(8, 108, 3.3, 0xe85d04, "ferguson", false);
  boomLift(-18, 106, 2.8, 0xf0d23c, "oconnell", false);

  // parked extra forklift
  const fk = boxMesh(1.3, 1.1, 2.2, mats.yellow);
  fk.position.set(30, 0.7, 34);
  scene.add(fk);
  addCollider(30, 34, 1.4, 2.3, 0, 1.3);

  // pipe racks
  for (let i = 0; i < 6; i++) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.4, 6), i % 2 ? mats.copper : mats.dark);
    p.rotation.z = Math.PI / 2;
    p.position.set(-22, 0.22 + i * 0.12, 40);
    scene.add(p);
  }

  // walking crews
  placeWorker("oconnell", 4, 20, 0, {
    path: [
      [4, 20],
      [14, 24],
      [14, 40],
      [-6, 40],
      [-6, 18],
    ],
    speed: 1.7,
    skin: 0,
    hair: 1,
  });
  placeWorker("ferguson", -8, 28, 0, {
    path: [
      [-8, 28],
      [-20, 28],
      [-20, 12],
      [2, 12],
      [2, 28],
    ],
    speed: 1.45,
    skin: 1,
    hair: 0,
    hold: "drill",
  });
  placeWorker("pipe", CB.hallWX, 58, 0, {
    path: [
      [CB.hallWX, CB.z0 + 4],
      [CB.hallWX, CB.z1 - 6],
      [CB.hallWX + 0.4, CB.z1 - 6],
      [CB.hallWX + 0.4, CB.z0 + 4],
    ],
    speed: 1.2,
    hold: "pipe",
    skin: 2,
    hair: 2,
  });
  placeWorker("oconnell", CB.dataX, CB.z0 - 8, 0, {
    path: [
      [CB.dataX, CB.z0 + 3],
      [CB.dataX, CB.z1 - 6],
    ],
    speed: 1.6,
    skin: 1,
    hair: 2,
    hold: "drill",
  });
  placeWorker("oconnell", CB.hallEX, 58, 0, {
    path: [
      [CB.hallEX, CB.z0 + 4],
      [CB.hallEX, CB.z1 - 6],
    ],
    speed: 1.5,
    skin: 3,
    hair: 0,
    hold: "drill",
  });
  placeWorker("labor", 0, 36, 0, {
    path: [
      [0, 22],
      [10, 30],
      [-4, 38],
      [0, 22],
    ],
    speed: 1.8,
    skin: 1,
    hair: 3,
  });
  placeWorker("ferguson", CB.hallWX, 60, 0, {
    path: [
      [CB.hallWX, 56],
      [CB.hallWX, CB.z1 - 6],
    ],
    speed: 1.4,
    skin: 0,
    hair: 1,
    hold: "drill",
  });
  placeWorker("oconnell", CB.hallEX, 70, 0, {
    path: [
      [CB.hallEX, 56],
      [CB.hallEX, CB.z1 - 6],
    ],
    speed: 1.5,
    skin: 2,
    hair: 0,
  });
  placeWorker("ferguson", CB.dataX, podBand(1).mid, 0, {
    path: [
      [CB.dataX, podBand(0).mid],
      [CB.dataX, podBand(3).mid],
    ],
    speed: 1.35,
    skin: 0,
    hair: 2,
  });
  placeWorker("pipe", 4, 104, 0, {
    path: [
      [-10, 104],
      [16, 106],
      [10, 112],
      [-8, 110],
    ],
    speed: 1.25,
    hold: "pipe",
    skin: 2,
    hair: 1,
  });

  // standing / working
  placeWorker("oconnell", CB.hallWX, 62, Math.PI / 2, { work: true, hold: "drill", skin: 0, hair: 1 });
  placeWorker("oconnell", CB.hallWX, 64.2, Math.PI / 2, { work: true, skin: 2, hair: 0 });
  placeWorker("ferguson", CB.hallEX, 71, -Math.PI / 2, { work: true, hold: "drill", skin: 1, hair: 2 });
  placeWorker("ferguson", CB.hallEX, 73.4, -Math.PI / 2, { work: true, skin: 3, hair: 1 });
  placeWorker("pipe", -7, 26, 0.4, { work: true, hold: "pipe", skin: 1, hair: 0 });
  placeWorker("pipe", -5.6, 25.2, -0.3, { work: true, hold: "pipe", skin: 0, hair: 3 });
  placeWorker("labor", 3.2, 31, 2.2, { work: true, skin: 2, hair: 1 });
  placeWorker("oconnell", -19, 17, 1.1, { work: true, hold: "drill", skin: 3, hair: 2 });
  placeWorker("ferguson", 11.5, 13.5, -0.6, { work: true, skin: 0, hair: 0 });
  placeWorker("labor", -2, 104, 3.0, { work: true, skin: 1, hair: 2 });
  placeWorker("pipe", 22, 54.8, Math.PI, { work: true, hold: "pipe", skin: 2, hair: 1 });
  placeWorker("oconnell", CB.hallWX - 1.5, 72, Math.PI / 2, { work: true, hold: "drill", skin: 0, hair: 3 });
  placeWorker("millwright", CB.mechX - 1.5, podBand(0).mid - 3, 0.4, { work: true, hold: "wrench", skin: 1, hair: 0 });
  placeWorker("millwright", CB.mechX, podBand(1).mid, -0.5, { work: true, hold: "wrench", skin: 2, hair: 2 });
  placeWorker("insulator", CB.mechX + 1.2, podBand(1).mid + 3, 1.2, { work: true, hold: "wrap", skin: 0, hair: 1 });
  placeWorker("insulator", CB.mechX, podBand(2).mid, 0.2, { work: true, hold: "wrap", skin: 3, hair: 0 });
  placeWorker("cleaner", CB.dataX, podBand(2).mid, 0, {
    path: [
      [CB.dataX, podBand(1).mid],
      [CB.dataX, podBand(2).mid],
      [CB.dataX, podBand(3).mid],
    ],
    speed: 1.15,
    hold: "broom",
    skin: 1,
    hair: 3,
  });
  placeWorker("cleaner", 8, podBand(0).mid + 4, Math.PI, { work: true, hold: "broom", skin: 0, hair: 2 });
  placeWorker("millwright", CB.west - 4, 60, 1.6, { work: true, hold: "wrench", skin: 2, hair: 1 });

  // weld flash on the pipe crew
  const weld = new THREE.PointLight(0x88ddff, 0, 5);
  weld.position.set(-6.2, 1.4, 25.6);
  scene.add(weld);
  state.weld = weld;

  // the blue scissor nobody claimed — Utah drives it now
  scissorLift(17, 22, 0.25, 1.0, 0x2a6fbb, null, false);
  state.driveLift = { mesh: scissorReturn };
  state.colliders.pop(); // a drivable lift can't collide with itself
  addItem({ id: "coffee", mesh: scissorReturn, x: 17, z: 22, label: "Run the blue scissor", liftDrive: true, done: false });

  // the AHJ — stands at the gate until his walk days come around
  const ahj = makeWorker("ahj", { skin: 0, hair: 0, hold: "clipboard" });
  ahj.position.set(2, 0, 8);
  ahj.rotation.y = 0.4;
  scene.add(ahj);
  ahj.traverse((o) => (o.userData.noBake = true));
  state.ahjNpc = { mesh: ahj, stuck: 0, lastX: 0, lastZ: 0 };

  // night-shift diesel — east of the south doors, on the walk from crib to CB-4
  const gen = new THREE.Group();
  const gFrame = boxMesh(3.2, 0.22, 1.55, mat(0x2a2c28));
  gFrame.position.y = 0.28;
  gen.add(gFrame);
  const gBody = boxMesh(2.7, 1.45, 1.35, mat(0xc8a428));
  gBody.position.set(0.1, 1.05, 0);
  gen.add(gBody);
  const gDoor = boxMesh(1.1, 0.85, 0.06, mat(0xb08c22));
  gDoor.position.set(-0.2, 1.05, 0.7);
  gen.add(gDoor);
  const gPanel = boxMesh(0.55, 0.5, 0.08, mat(0x1a1c18));
  gPanel.position.set(1.05, 1.15, 0.68);
  gen.add(gPanel);
  const gLed = boxMesh(0.1, 0.1, 0.06, new THREE.MeshLambertMaterial({ color: 0x4cff6a, emissive: 0x2aff4a, emissiveIntensity: 1.1 }));
  gLed.position.set(1.05, 1.42, 0.74);
  gen.add(gLed);
  const gTank = boxMesh(2.7, 0.38, 1.35, mat(0x3a3220));
  gTank.position.set(0.1, 0.48, 0);
  gen.add(gTank);
  const hitch = boxMesh(0.9, 0.12, 0.18, mat(0x3a3c38));
  hitch.position.set(-1.85, 0.42, 0);
  gen.add(hitch);
  for (const sx of [-0.85, 0.95]) {
    for (const sz of [-0.72, 0.72]) {
      const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.18, 10), mat(0x1a1a1a));
      wh.rotation.z = Math.PI / 2;
      wh.position.set(sx, 0.28, sz);
      gen.add(wh);
    }
  }
  const stack = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.11, 0.85, 8),
    new THREE.MeshLambertMaterial({ color: 0x2a2a2a, emissive: 0x331800, emissiveIntensity: 0.5 })
  );
  stack.position.set(1.15, 2.15, -0.2);
  gen.add(stack);
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.4 })
  );
  glow.position.set(1.15, 2.6, -0.2);
  gen.add(glow);
  const mast = boxMesh(0.08, 2.2, 0.08, mat(0x3a3c38));
  mast.position.set(-1.35, 1.5, 0.4);
  gen.add(mast);
  const floodHead = boxMesh(0.35, 0.18, 0.22, mat(0x222));
  floodHead.position.set(-1.35, 2.55, 0.4);
  gen.add(floodHead);
  const can = boxMesh(0.28, 0.38, 0.28, mat(0xc45a12));
  can.position.set(0.55, 1.95, 0.2);
  gen.add(can);
  const canCap = boxMesh(0.12, 0.08, 0.12, mat(0x222));
  canCap.position.set(0.55, 2.18, 0.2);
  gen.add(canCap);
  const flood = new THREE.PointLight(0xffe2a8, 3.4, 42);
  flood.position.set(-1.35, 2.55, 0.4);
  gen.add(flood);
  const yardFill = new THREE.PointLight(0xffd090, 1.6, 36);
  yardFill.position.set(0, 3.2, 0);
  gen.add(yardFill);
  gen.position.set(CB.hallWX + 4, 0, CB.z0 - 6);
  gen.rotation.y = 0.55;
  scene.add(gen);
  gen.traverse((o) => (o.userData.noBake = true));
  addCollider(CB.hallWX + 4, CB.z0 - 6, 3.4, 1.8, 0, 2.2);
  const tag = makeNameTag("TEMP GENNY", "DIESEL · SOUTH DOORS");
  tag.scale.set(2.6, 0.65, 1);
  tag.position.set(CB.hallWX + 4, 2.9, CB.z0 - 7.2);
  tag.rotation.y = Math.PI;
  scene.add(tag);
  tag.traverse((o) => (o.userData.noBake = true));
  gen.userData.flood = flood;
  gen.userData.fill = yardFill;
  gen.userData.glow = glow;
  gen.userData.led = gLed;
  gen.userData.stack = stack;
  state.genny = gen;

  // reel rack for the big pull
  const rack = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const sp = spoolMesh();
    sp.position.set(i * 0.9 - 0.9, 0, 0);
    rack.add(sp);
  }
  rack.position.set(13, 0, 13);
  scene.add(rack);
  rack.traverse((o) => (o.userData.noBake = true));
  state.reelRack = rack;

  // the reel Utah carries on his shoulder
  const carry = spoolMesh();
  carry.scale.setScalar(0.7);
  carry.position.set(0, 1.62, -0.28);
  carry.visible = false;
  player.add(carry);
  carry.traverse((o) => (o.userData.noBake = true));
  state.carrySpool = carry;

  // Lugo walks the center corridor, walkie up, checking the fire-alarm run
  state.lugoMesh = placeWorker("foreman", CB.corX, CB.z0 + 6, 0, {
    path: [
      [CB.corX, CB.z0 + 4],
      [CB.corX, CB.z1 - 4],
    ],
    speed: 1.3,
    skin: getTraveler() === "tremont" ? 0 : 1,
    hair: getTraveler() === "tremont" ? 3 : 1,
    beard: true,
    hold: "radio",
  });
  {
    const tag = makeNameTag(foremanName().toUpperCase(), "FOREMAN · CH. 3");
    tag.scale.set(2.3, 0.58, 1);
    tag.position.y = 2.4;
    state.lugoMesh.add(tag);
  }
  state.lugoRec = state.crew.find((c) => c.mesh === state.lugoMesh); // huddles pause his walk

  buildDrew();
  buildJoe();
  buildChris();
  buildDon();
  buildNate();
  buildHotAisle();
  buildKenny();
  buildSafetyLady();
  buildRedBeard();
  buildAndy();
  buildSiteRadio();
}

function makeBoombox() {
  const g = new THREE.Group();
  const body = boxMesh(0.62, 0.28, 0.22, mat(0x1c1c1c));
  body.position.y = 0.22;
  g.add(body);
  const stripe = boxMesh(0.64, 0.05, 0.24, mats.yellow);
  stripe.position.y = 0.35;
  g.add(stripe);
  for (const sx of [-0.18, 0.18]) {
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 10), mat(0x2a2a2a));
    sp.rotation.x = Math.PI / 2;
    sp.position.set(sx, 0.2, 0.12);
    g.add(sp);
    const cone = new THREE.Mesh(new THREE.CircleGeometry(0.07, 10), mat(0x111));
    cone.position.set(sx, 0.2, 0.145);
    g.add(cone);
  }
  const handle = boxMesh(0.38, 0.035, 0.035, mat(0x333));
  handle.position.y = 0.46;
  g.add(handle);
  const postL = boxMesh(0.03, 0.12, 0.03, mat(0x333));
  postL.position.set(-0.18, 0.42, 0);
  g.add(postL);
  const postR = postL.clone();
  postR.position.x = 0.18;
  g.add(postR);
  const led = new THREE.Mesh(
    new THREE.SphereGeometry(0.028, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0x4a1a14 })
  );
  led.position.set(0, 0.22, 0.13);
  g.add(led);
  g.userData.led = led;
  return g;
}

function buildSiteRadio() {
  placeBox(SITE_RADIO.x, 0, SITE_RADIO.z, 0.85, 0.72, 0.7, mats.dark, true);
  const box = makeBoombox();
  box.position.set(SITE_RADIO.x, 0.72, SITE_RADIO.z);
  box.rotation.y = Math.PI / 2; // speakers face the hallway
  scene.add(box);
  box.traverse((o) => (o.userData.noBake = true));
  SITE_RADIO.led = box.userData.led;
}

/* ------------------------------------------------------------------ */
/*  DREW — GENERAL FOREMAN                                             */
/* ------------------------------------------------------------------ */
const DREW_PATROL = [
  [-26, 12],
  [-14, 16],
  [-6, 26],
  [-18, 30],
  [-28, 22],
];

function buildNate() {
  const nate = placeWorker("nate", 12.4, 20.5, 0.4, {
    path: [
      [12.4, 20.5],
      [18.5, 24],
      [8.2, 28.5],
      [14, 16.8],
    ],
    speed: 1.35,
    skin: 2,
    hair: 1,
  });
  const tag = makeNameTag("NATE", "WIENERS · BEER");
  tag.scale.set(2.2, 0.55, 1);
  tag.position.y = 2.38;
  nate.add(tag);
}

function buildKenny() {
  const kenny = placeWorker("kenny", 16.8, 14.2, -0.4, {
    path: [
      [16.8, 14.2],
      [22.4, 18.5],
      [9.5, 22.0],
      [18.2, 11.6],
    ],
    speed: 1.15,
    skin: 0,
    hair: 3,
  });
  const tag = makeNameTag("KENNY THE STEW", "$60 TIE-DYE");
  tag.scale.set(2.6, 0.58, 1);
  tag.position.y = 2.42;
  kenny.add(tag);
}

function buildHotAisle() {
  const glow = new THREE.MeshBasicMaterial({
    color: 0xff6a1a,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });
  const floor = new THREE.MeshBasicMaterial({
    color: 0xff4a12,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  });
  const tape = new THREE.MeshBasicMaterial({ color: 0x1a140c });
  {
    const c = crossBand(HOT_CROSS);
    const w = CB.data1 - CB.data0;
    const strip = boxMesh(w, 0.05, 0.42, glow);
    strip.position.set(CB.dataX, 5.42, c.mid);
    strip.userData.noBake = true;
    scene.add(strip);
    const pad = boxMesh(w - 0.35, 0.02, Math.min(c.z1 - c.z0 - 0.2, 1.85), floor);
    pad.position.set(CB.dataX, 0.03, c.mid);
    pad.userData.noBake = true;
    scene.add(pad);
    for (const sx of [-w * 0.42, w * 0.42]) {
      const t = boxMesh(0.12, 0.03, Math.min(c.z1 - c.z0 - 0.15, 1.9), tape);
      t.position.set(CB.dataX + sx, 0.04, c.mid);
      t.userData.noBake = true;
      scene.add(t);
    }
    const tag = makeNameTag("HOT AISLE", "110°+ · DON'T CAMP");
    tag.scale.set(2.8, 0.62, 1);
    tag.position.set(CB.dataX, 3.15, c.mid);
    scene.add(tag);
  }
  const pl = new THREE.PointLight(0xff7a28, 0.4, 24);
  pl.position.set(CB.dataX, 4.1, crossBand(HOT_CROSS).mid);
  scene.add(pl);
}

function buildSafetyLady() {
  const pat = placeWorker("safety", 19.4, 24.6, 0.3, {
    path: [
      [19.4, 24.6],
      [14.8, 27.2],
      [21.6, 20.4],
      [15.6, 21.8],
    ],
    speed: 1.4,
    skin: 2,
    hair: 0,
    hold: "clipboard",
    followLift: true,
  });
  const tag = makeNameTag("MARITZA", "SITE SAFETY");
  tag.scale.set(2.4, 0.56, 1);
  tag.position.y = 2.4;
  pat.add(tag);
}

function buildRedBeard() {
  const p0 = podBand(0);
  const x = CB.dataX;
  const w = placeWorker("redbeard", x + 7, p0.mid, 0.3, {
    path: [
      [x + 7, p0.mid - 6],
      [x + 7, p0.mid + 6],
      [x - 7, p0.mid + 6],
      [x - 7, p0.mid - 6],
    ],
    speed: 1.22,
    skin: 1,
    hair: 1,
    hold: "radio",
  });
  const tag = makeNameTag("RED BEARD", "DATA HALL 1");
  tag.scale.set(2.6, 0.58, 1);
  tag.position.y = 2.42;
  w.add(tag);
}

function buildAndy() {
  const p1 = podBand(1);
  const x = CB.dataX;
  const w = placeWorker("andy", x - 7, p1.mid, -0.4, {
    path: [
      [x - 7, p1.mid - 6],
      [x + 7, p1.mid - 6],
      [x + 7, p1.mid + 6],
      [x - 7, p1.mid + 6],
    ],
    speed: 1.12,
    skin: 0,
    hair: 2,
    hold: "clipboard",
  });
  const tag = makeNameTag("ANDY", "SICK & NEEDY");
  tag.scale.set(2.5, 0.56, 1);
  tag.position.y = 2.4;
  w.add(tag);
  state.andy = w;
  // the collector actually collects — the interactable trails him as he walks
  addItem({
    id: "andyFund",
    mesh: null,
    x: x - 7,
    z: p1.mid,
    label: "Give five bucks · sick & needy",
    andyFund: true,
    done: false,
  });
}

function buildDrew() {
  const w = makeWorker("gf", { skin: 2, hair: 2, beard: true, hold: "clipboard" });
  w.position.set(DREW_PATROL[0][0], 0, DREW_PATROL[0][1]);
  const tag = makeNameTag("DREW", "GENERAL FOREMAN");
  tag.position.y = 2.55;
  tag.scale.set(3.1, 0.78, 1);
  if (tag.material) tag.material.fog = false;
  w.add(tag);
  scene.add(w);
  w.traverse((o) => (o.userData.noBake = true));
  w.visible = true;
  state.drew = { mesh: w, mode: "patrol", i: 0, u: 0, stuck: 0, lastX: 0, lastZ: 0, tag };
}


function makeNameTag(title, sub) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 128;
  const g = c.getContext("2d");
  g.clearRect(0, 0, 512, 128);
  // plate
  g.fillStyle = "rgba(10, 12, 16, 0.9)";
  g.beginPath();
  const r = 18;
  g.moveTo(r, 8);
  g.arcTo(504, 8, 504, 120, r);
  g.arcTo(504, 120, 8, 120, r);
  g.arcTo(8, 120, 8, 8, r);
  g.arcTo(8, 8, 504, 8, r);
  g.closePath();
  g.fill();
  // lime edge
  g.strokeStyle = "#d6f04a";
  g.lineWidth = 4;
  g.stroke();
  g.fillStyle = "#d6f04a";
  g.font = "bold 52px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(title, 256, sub ? 48 : 64);
  if (sub) {
    g.fillStyle = "#c8c4bc";
    g.font = "600 28px system-ui, sans-serif";
    g.fillText(sub, 256, 96);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true });
  const s = new THREE.Sprite(mat);
  s.scale.set(2.6, 0.65, 1);
  s.position.y = 2.45;
  s.userData.noBake = true;
  return s;
}

/* ------------------------------------------------------------------ */
/*  CHANNEL 7 — anonymous presence, ghosts, chatter, play count        */
/*  No accounts. Same Firestore the board already uses.                */
/* ------------------------------------------------------------------ */
const net = {
  pid: "",
  plays: 0,
  onSite: 0,
  handsKnown: 0,
  remotes: new Map(),
  hail: new Set(),
  seenWave: new Map(),
  lastChat: 0,
  lastIds: new Set(),
  beatT: 0,
  pullT: 0,
  chatT: 0,
  wave: 0,
  roster: [],
};

const lwMem = Object.create(null);

function durableGet(k) {
  try {
    const v = localStorage.getItem(k);
    if (v != null && String(v) !== "") return v;
  } catch (_) {}
  try {
    const esc = String(k).replace(/[$()*+./?[\\\]^{|}]/g, "\\$&");
    const m = document.cookie.match(new RegExp("(?:^|; )" + esc + "=([^;]*)"));
    if (m && m[1]) {
      const v = decodeURIComponent(m[1]);
      try {
        if (v) localStorage.setItem(k, v);
      } catch (_) {}
      return v;
    }
  } catch (_) {}
  return lwMem[k] || "";
}

function durableSet(k, v) {
  const s = v == null ? "" : String(v);
  lwMem[k] = s;
  try {
    localStorage.setItem(k, s);
  } catch (_) {}
  try {
    const exp = new Date(Date.now() + 400 * 864e5).toUTCString();
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = k + "=" + encodeURIComponent(s) + "; expires=" + exp + "; path=/; SameSite=Lax" + secure;
  } catch (_) {}
}

function selfPid() {
  if (net.pid) return net.pid;
  net.pid = durableGet("lw_pid") || "";
  if (!net.pid) {
    net.pid = "h" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);
  }
  durableSet("lw_pid", net.pid);
  return net.pid;
}

function handleName() {
  return commitHand(false);
}

function readGateLocal() {
  const el = $("gate-local");
  let loc = (el && el.value) || "";
  if (!loc) loc = durableGet("lw_local") || "";
  return String(loc).trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

/** Persist the gate slip. If require=true and empty, returns "". */
function commitHand(write = true) {
  const el = $("gate-name");
  let n = (el && el.value) || "";
  if (!String(n).trim()) n = durableGet("lw_name") || "";
  n = String(n)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9 .'\-]/g, "")
    .slice(0, 20);
  const loc = readGateLocal();
  if (write && n) {
    durableSet("lw_name", n);
    durableSet("lw_local", loc);
    const focused = document.activeElement === el;
    if (el && !focused && el.value.toUpperCase() !== n) el.value = n;
    if ($("gate-local") && document.activeElement !== $("gate-local")) $("gate-local").value = loc;
    if ($("chat-handle")) $("chat-handle").value = n;
    if ($("post-name")) $("post-name").value = n;
    if ($("post-local")) $("post-local").value = loc;
  }
  return n;
}

function slipOk() {
  return !!commitHand(false) && !!readGateLocal();
}

function fillGateFromSave() {
  try {
    const n = durableGet("lw_name") || "";
    const loc = durableGet("lw_local") || "";
    const nameEl = $("gate-name");
    const locEl = $("gate-local");
    const editing = document.activeElement === nameEl || document.activeElement === locEl;
    if (editing) return;
    if (nameEl && n) nameEl.value = n;
    if (locEl && loc) locEl.value = loc;
    if ($("chat-handle") && n) $("chat-handle").value = n;
  } catch (_) {}
}

function armGateField(el) {
  if (!el) return;
  const unlock = () => {
    try {
      el.removeAttribute("readonly");
    } catch (_) {}
  };
  el.addEventListener("focus", unlock);
  el.addEventListener("touchstart", unlock, { passive: true });
  el.addEventListener("pointerdown", unlock);
}

function scheduleGateRestore() {
  const tick = () => fillGateFromSave();
  tick();
  [50, 150, 400, 1000, 2000].forEach((ms) => setTimeout(tick, ms));
  addEventListener("pageshow", tick);
  addEventListener("visibilitychange", () => {
    if (!document.hidden) tick();
  });
}

function paintWhoName() {
  const whoEl = document.querySelector(".who-name");
  if (!whoEl) return;
  const t = getTraveler() === "tremont" ? "TREMONT" : "UTAH";
  const n = commitHand(false);
  const loc = readGateLocal();
  const bits = [n || t, t];
  if (loc) bits.push("L." + loc);
  whoEl.textContent = bits.join(" · ");
}

function fsVal(f) {
  if (!f) return null;
  if (f.stringValue != null) return f.stringValue;
  if (f.integerValue != null) return Number(f.integerValue);
  if (f.doubleValue != null) return Number(f.doubleValue);
  if (f.timestampValue) return Date.parse(f.timestampValue);
  if (f.booleanValue != null) return !!f.booleanValue;
  return null;
}

async function fsPatch(path, fields, opts = {}) {
  const mask = Object.keys(fields)
    .map((k) => "updateMask.fieldPaths=" + encodeURIComponent(k))
    .join("&");
  let q = `${FS_DOCS}/${path}?key=${FS_KEY}`;
  if (mask) q += "&" + mask;
  if (opts.createOnly) q += "&currentDocument.exists=false";
  const r = await fsFetch(
    q,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields }),
    },
    !!opts.force
  );
  if (!r.ok) {
    const err = new Error("patch " + r.status);
    err.status = r.status;
    try {
      err.body = await r.text();
    } catch (_) {}
    throw err;
  }
  return r;
}

async function fsCreateIfAbsent(path, fields) {
  try {
    await fsPatch(path, fields, { createOnly: true, force: true });
    return true;
  } catch (e) {
    const body = String((e && e.body) || e && e.message || "");
    if (/ALREADY_EXISTS|FAILED_PRECONDITION|already exists|exists=false/i.test(body) || (e && (e.status === 400 || e.status === 409 || e.status === 412))) {
      return false;
    }
    throw e;
  }
}

async function fsPost(col, fields) {
  const r = await fsFetch(`${FS_DOCS}/${col}?key=${FS_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  }, true);
  if (!r.ok) {
    const err = new Error("post " + r.status);
    err.status = r.status;
    throw err;
  }
  try { return await r.json(); } catch (_) { return {}; }
}

async function fsGet(path) {
  const r = await fsFetch(`${FS_DOCS}/${path}?key=${FS_KEY}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("get " + r.status);
  return r.json();
}

async function fsList(col, pageSize = 12) {
  const r = await fsFetch(`${FS_DOCS}/${col}?pageSize=${pageSize}&key=${FS_KEY}`);
  if (!r.ok) return [];
  const j = await r.json();
  return j.documents || [];
}

async function fsDel(path) {
  try {
    await fetch(`${FS_DOCS}/${path}?key=${FS_KEY}`, { method: "DELETE" });
  } catch (_) {}
}

function loadPlaysCache() {
  try {
    const n = Number(localStorage.getItem(PLAYS_CACHE) || 0);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch (_) {
    return 0;
  }
}

function savePlaysCache(n) {
  try {
    if (n > 0) localStorage.setItem(PLAYS_CACHE, String(n));
  } catch (_) {}
}

function paintSitePulse() {
  const live = Math.max(0, net.onSite | 0);
  const plays = Math.max(net.plays | 0, loadPlaysCache(), PLAYS_FLOOR, net.handsKnown | 0);
  net.plays = plays;
  const el = $("site-pulse");
  if (el) {
    const on = live <= 0 ? "GATE OPEN" : live === 1 ? "1 ON SITE" : live + " ON SITE";
    el.textContent = `${on} · ${plays.toLocaleString()} HANDS HAVE WALKED ON`;
  }
  const sn = $("site-n");
  if (sn) sn.textContent = String(Math.max(1, live));
}

async function refreshPlaysFromCloud() {
  if (fsCooling()) return Math.max(loadPlaysCache(), PLAYS_FLOOR, net.plays | 0);
  try {
    const doc = await fsGet("stats/global");
    const remote = Number(fsVal(doc && doc.fields && doc.fields.plays) || 0);
    if (remote > 0) {
      const n = Math.max(remote, loadPlaysCache(), PLAYS_FLOOR, net.plays | 0);
      net.plays = n;
      savePlaysCache(n);
      paintSitePulse();
      return n;
    }
  } catch (_) {}
  return Math.max(loadPlaysCache(), PLAYS_FLOOR, net.plays | 0);
}

async function bumpPlays() {
  // Display only. Unique walk-ons are claimed in claimVisitor() on START,
  // not on every title-screen load (iPhone Safari reloads a lot).
  await refreshPlaysFromCloud();
  paintSitePulse();
}

function visitorNameId(name) {
  const s = String(name || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return s ? "n_" + s.slice(0, 48) : "";
}

async function handAlreadyOnBoard(name) {
  const id = handId(name, "", "utah");
  const idT = handId(name, "", "tremont");
  try {
    const a = await fsGet("hands/" + id);
    if (a) return true;
  } catch (_) {}
  if (idT !== id) {
    try {
      const b = await fsGet("hands/" + idT);
      if (b) return true;
    } catch (_) {}
  }
  return false;
}

async function claimVisitor(name) {
  const n = String(name || "")
    .trim()
    .toUpperCase()
    .slice(0, 20);
  if (!n) return;
  if (durableGet("lw_counted") === "1" && durableGet("lw_counted_name") === n) {
    await refreshPlaysFromCloud();
    return;
  }
  const pid = selfPid();
  const nid = visitorNameId(n);
  if (!nid) return;
  try {
    const createdName = await fsCreateIfAbsent("visitors/" + nid, {
      name: { stringValue: n },
      pid: { stringValue: pid },
      ts: { timestampValue: new Date().toISOString() },
    });
    await fsCreateIfAbsent("visitors/" + pid, {
      name: { stringValue: n },
      pid: { stringValue: pid },
      ts: { timestampValue: new Date().toISOString() },
    }).catch(() => false);
    const already = await handAlreadyOnBoard(n);
    if (createdName && !already) {
      const cur = await refreshPlaysFromCloud();
      const next = Math.max(cur, PLAYS_FLOOR, net.handsKnown | 0) + 1;
      await fsPatch(
        "stats/global",
        { plays: { integerValue: String(next) } },
        { force: true }
      );
      net.plays = next;
      savePlaysCache(next);
    }
    durableSet("lw_counted", "1");
    durableSet("lw_counted_name", n);
  } catch (_) {
    // offline / rules — retry next walk-on, do not mark counted
  }
  paintSitePulse();
}

function presenceFields() {
  const playing = state.mode === "play" || state.mode === "end" || state.mode === "pause" || state.mode === "store";
  return {
    pid: { stringValue: selfPid() },
    name: { stringValue: handleName() },
    who: { stringValue: getTraveler() === "tremont" ? "tremont" : "utah" },
    x: { doubleValue: playing ? player.position.x : SPAWN.x },
    z: { doubleValue: playing ? player.position.z : SPAWN.z },
    yaw: { doubleValue: playing ? facing : 0 },
    day: { integerValue: String(day || 1) },
    mode: { stringValue: String(state.mode || "title").slice(0, 12) },
    wave: { integerValue: String(net.wave | 0) },
    ts: { timestampValue: new Date().toISOString() },
  };
}

async function netBeat() {
  if (!handleName()) return;
  try {
    await fsPatch("presence/" + selfPid(), presenceFields());
  } catch (_) {}
}

function parsePresence(doc) {
  const f = doc.fields || {};
  const id = fsVal(f.pid) || String(doc.name || "").split("/").pop();
  const ts = fsVal(f.ts) || Date.parse(doc.updateTime || "") || 0;
  return {
    id,
    name: String(fsVal(f.name) || "HAND").slice(0, 24),
    who: fsVal(f.who) === "tremont" ? "tremont" : "utah",
    x: Number(fsVal(f.x) || 0),
    z: Number(fsVal(f.z) || 0),
    yaw: Number(fsVal(f.yaw) || 0),
    day: Number(fsVal(f.day) || 1),
    mode: String(fsVal(f.mode) || "title"),
    wave: Number(fsVal(f.wave) || 0),
    ts,
  };
}

function ensureGhost(p) {
  if (settings.mp === false) return null;
  let g = net.remotes.get(p.id);
  if (g) return g;
  if (!scene) return null;
  const kit = p.who === "tremont" ? "labor" : "oconnell";
  const mesh = makeWorker(kit, { skin: p.who === "tremont" ? 1 : 2, hair: p.who === "tremont" ? 0 : 1, hold: "radio" });
  mesh.position.set(p.x, 0, p.z);
  scene.add(mesh);
  mesh.traverse((o) => (o.userData.noBake = true));
  const tag = makeNameTag(p.name, p.who === "tremont" ? "TREMONT · CH.7" : "UTAH · CH.7");
  mesh.add(tag);
  g = { mesh, tag, tx: p.x, tz: p.z, tyaw: p.yaw, name: p.name, who: p.who };
  net.remotes.set(p.id, g);
  return g;
}

function clearGhosts() {
  for (const id of [...net.remotes.keys()]) dropGhost(id);
}

function disposeGhostTree(root) {
  // ghosts are churned (mode flips, 45s timeouts), so their merged
  // geometries, face textures, and tag canvases must actually be freed
  root.traverse((o) => {
    if (o.isMesh || o.isSprite) {
      o.geometry?.dispose?.();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m || m === VERT_MAT) continue;
        m.map?.dispose?.();
        m.dispose?.();
      }
    }
  });
}

function dropGhost(id) {
  const g = net.remotes.get(id);
  if (!g) return;
  scene.remove(g.mesh);
  disposeGhostTree(g.mesh);
  net.remotes.delete(id);
  net.hail.delete(id);
  net.seenWave.delete(id);
}

function syncGhosts(rows) {
  const live = new Set();
  const now = Date.now();
  net.roster = [];
  for (const p of rows) {
    if (!p.id || p.id === selfPid()) continue;
    if (now - p.ts > 45000) continue;
    live.add(p.id);
    net.roster.push(p);
    const playing = p.mode === "play" || p.mode === "pause" || p.mode === "end" || p.mode === "store";
    if (settings.mp === false) {
      dropGhost(p.id);
    } else if (state.built && playing) {
      const g = ensureGhost(p);
      if (g) {
        g.tx = p.x;
        g.tz = p.z;
        g.tyaw = p.yaw;
        if (g.name !== p.name) {
          g.name = p.name;
          const nt = makeNameTag(p.name, p.who === "tremont" ? "TREMONT · CH.7" : "UTAH · CH.7");
          g.mesh.remove(g.tag);
          disposeGhostTree(g.tag);
          g.mesh.add(nt);
          g.tag = nt;
        }
      }
    } else {
      dropGhost(p.id);
    }
    if (p.wave && net.seenWave.get(p.id) !== p.wave) {
      net.seenWave.set(p.id, p.wave);
      if (p.wave > 1000) toast(p.name + " WAVED");
    }
    if (!net.lastIds.has(p.id) && p.mode !== "title") toast(p.name + " WALKED ON");
  }
  for (const id of [...net.remotes.keys()]) if (!live.has(id)) dropGhost(id);
  net.lastIds = live;
  paintRoster();
}

function paintRoster() {
  const el = $("chat-roster");
  if (!el) return;
  const me = handleName() || "YOU";
  const meWho = getTraveler() === "tremont" ? "TREMONT" : "UTAH";
  el.textContent = "";
  const mine = document.createElement("span");
  mine.className = "roster-me";
  mine.textContent = `${me} · ${meWho}`;
  el.appendChild(mine);
  for (const p of net.roster || []) {
    const tag = p.who === "tremont" ? "TREMONT" : "UTAH";
    const mode = p.mode === "play" ? "ON HALL" : p.mode === "title" ? "GATE" : String(p.mode).toUpperCase();
    // p.name comes from the shared presence doc — never mark it up as HTML
    const row = document.createElement("span");
    row.textContent = `${p.name} · ${tag} · ${mode}`;
    el.appendChild(row);
  }
  const sub = $("chat-sub");
  if (sub) {
    const n = Math.max(1, net.onSite);
    sub.textContent =
      n <= 1
        ? "Open group channel — every traveler on site hears this. You're alone on the horn."
        : `Open group channel — ${n} on site. Everyone on CH. 7 hears every transmission.`;
  }
}

function animateGhosts(dt) {
  const t = performance.now();
  for (const g of net.remotes.values()) {
    const mx = g.mesh.position.x;
    const mz = g.mesh.position.z;
    const dx = g.tx - mx;
    const dz = g.tz - mz;
    const dist = Math.hypot(dx, dz);
    if (dist > 18) {
      g.mesh.position.x = g.tx;
      g.mesh.position.z = g.tz;
    } else {
      const k = 1 - Math.pow(0.001, dt);
      g.mesh.position.x += dx * k;
      g.mesh.position.z += dz * k;
    }
    g.mesh.rotation.y = g.tyaw;
    const moving = dist > 0.12;
    const ud = g.mesh.userData;
    if (ud && ud.legL) {
      const w = moving ? t * 0.012 : 0;
      ud.legL.rotation.x = Math.sin(w) * 0.55;
      ud.legR.rotation.x = Math.cos(w) * 0.55;
      ud.armL.rotation.x = Math.cos(w) * 0.4;
      ud.armR.rotation.x = -1.25;
    }
    if (state.mode === "play") {
      const dMe = Math.hypot(player.position.x - g.mesh.position.x, player.position.z - g.mesh.position.z);
      if (dMe < 6.5 && !net.hail.has(g.name)) {
        net.hail.add(g.name);
        toast(g.name + " ON YOUR HALL");
      }
    }
  }
}

async function pullPresence() {
  if (settings.mp === false || fsCooling()) return;
  try {
    const docs = await fsList("presence", 40);
    const rows = docs.map(parsePresence);
    const now = Date.now();
    // 3 min live window matches sparse 90s heartbeats — stale docs are not "on site"
    const live = rows.filter((p) => p.ts && now - p.ts < 180000);
    const uniq = new Set(live.map((p) => p.id).filter(Boolean));
    net.onSite = uniq.size;
    paintSitePulse();
    syncGhosts(live);
  } catch (_) {}
}

function renderChatLog(docs) {
  const el = $("chat-log");
  if (!el) return;
  el.textContent = "";
  const rows = docs
    .map((d) => {
      const f = d.fields || {};
      return {
        name: String(fsVal(f.name) || "?"),
        who: fsVal(f.who),
        text: String(fsVal(f.text) || ""),
        ts: fsVal(f.ts) || 0,
      };
    })
    .filter((r) => r.text && !String(r.text).startsWith("[TICKET]"))
    .sort((a, b) => a.ts - b.ts)
    .slice(-40);
  if (!rows.length) {
    el.textContent = "Nobody on the group channel yet. First one on CH. 7 owns the silence.";
    return;
  }
  const me = handleName();
  for (const r of rows) {
    const line = document.createElement("div");
    line.className = "chat-line" + (r.name === me ? " me" : "");
    const who = document.createElement("span");
    who.className = "ch-who";
    const tag = r.who === "tremont" ? "TREMONT" : r.who === "utah" ? "UTAH" : "";
    who.textContent = tag ? `${r.name} · ${tag}` : r.name;
    const tx = document.createElement("span");
    tx.textContent = r.text;
    line.appendChild(who);
    line.appendChild(tx);
    el.appendChild(line);
  }
  el.scrollTop = el.scrollHeight;
}

let lastChatSeen = 0;
async function pullChat(announce) {
  try {
    const docs = await fsList("chatter", 12);
    if (!$("chat-dock").classList.contains("hidden")) renderChatLog(docs);
    if (!announce) return;
    const rows = docs
      .map((d) => {
        const f = d.fields || {};
        return { name: fsVal(f.name), text: fsVal(f.text), ts: fsVal(f.ts) || 0, who: fsVal(f.who) };
      })
      .filter((r) => r.text && !String(r.text).startsWith("[TICKET]"))
      .sort((a, b) => a.ts - b.ts);
    const newest = rows[rows.length - 1];
    if (newest && newest.ts > lastChatSeen && newest.name !== handleName() && newest.text) {
      if (lastChatSeen) {
        $("radio-line").textContent = newest.text;
        document.querySelector(".radio-tag").textContent = newest.name + " · CH. 7";
        const face = $("radio-face");
        if (face) {
          face.src = newest.who === "tremont" ? "assets/tremont_portrait.jpg" : "assets/utah_portrait.jpg";
          face.alt = newest.name;
        }
        radioWho = "";
        $("radio").classList.add("show");
        sfx("radio");
        clearTimeout(radioTimer);
        radioTimer = setTimeout(() => $("radio").classList.remove("show"), 4200);
      }
      lastChatSeen = newest.ts;
    } else if (newest) lastChatSeen = Math.max(lastChatSeen, newest.ts);
  } catch (_) {}
}

async function sendChat() {
  const inp = $("chat-text");
  const raw = (inp.value || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 80);
  if (!raw) return;
  if (Date.now() - net.lastChat < 2500) {
    toast("HOLD THE HORN", true);
    return;
  }
  const handle = handleName();
  if (!handle) {
    toast("NAME GOES ON THE SLIP", true);
    $("gate-name")?.focus();
    return;
  }
  if ($("chat-handle")) $("chat-handle").value = handle;
  net.lastChat = Date.now();
  inp.value = "";
  try {
    await fsPost("chatter", {
      name: { stringValue: handle },
      who: { stringValue: getTraveler() === "tremont" ? "tremont" : "utah" },
      text: { stringValue: raw },
      ts: { timestampValue: new Date().toISOString() },
    });
    await pullChat(false);
    toast("ON CH. 7");
  } catch (_) {
    toast("HORN'S DEAD", true);
  }
}

function sendWave() {
  net.wave = Date.now();
  toast("YOU WAVED");
  netBeat();
}

function openChat() {
  const pg = $("panel-game");
  if (pg && !pg.classList.contains("hidden")) return; // no chat underneath a minigame panel
  const handle = handleName();
  const h = $("chat-handle");
  if (h) h.value = handle;
  if (!handle) {
    toast("NAME GOES ON THE SLIP", true);
    $("gate-name")?.focus();
    return;
  }
  $("chat-dock").classList.remove("hidden");
  paintRoster();
  pullChat(false);
  pullPresence();
}

function closeChat() {
  $("chat-dock").classList.add("hidden");
}

function netTick(dt) {
  if (document.hidden) return;
  if (state.mode === "play" || state.mode === "end") animateGhosts(dt);
  if (fsCooling()) return;
  if (settings.mp === false) return;
  net.beatT -= dt;
  net.pullT -= dt;
  net.chatT -= dt;
  const playing = state.mode === "play" || state.mode === "end" || state.mode === "pause";
  const chatOpen = !$("chat-dock")?.classList.contains("hidden");
  if (net.beatT <= 0) {
    net.beatT = 5;
    if (handleName() && playing) netBeat();
  }
  if (net.pullT <= 0) {
    net.pullT = playing || chatOpen ? 8 : 30;
    if (playing || chatOpen) pullPresence();
  }
  if (net.chatT <= 0) {
    net.chatT = chatOpen ? 20 : 90;
    if (chatOpen) pullChat(true);
  }
}

function netBoot() {
  selfPid();
  fillGateFromSave();
  scheduleGateRestore();
  armGateField($("gate-name"));
  armGateField($("gate-local"));
  const h = $("chat-handle");
  try {
    if (h) h.value = durableGet("lw_name") || handleName();
  } catch (_) {
    if (h) h.value = handleName();
  }
  // Refresh the walk-on total. Do NOT increment here — iPhone Safari
  // reloads the title a lot; unique hands are claimed on START.
  refreshPlaysFromCloud();
  flushPending();
  addEventListener("pagehide", () => {
    if (settings.mp && !fsCooling()) fsDel("presence/" + selfPid());
  });
  $("btn-chat")?.addEventListener("click", openChat);
  $("btn-radio7")?.addEventListener("click", openChat);
  $("btn-wave")?.addEventListener("click", sendWave);
  $("chat-close")?.addEventListener("click", closeChat);
  $("chat-send")?.addEventListener("click", sendChat);
  $("chat-wave")?.addEventListener("click", sendWave);
  $("chat-text")?.addEventListener("keydown", (e) => {
    if (e.code === "Enter") {
      e.preventDefault();
      sendChat();
    }
  });
  const bindGate = (id) => {
    const el = $(id);
    if (!el) return;
    let typed = false;
    const markTyped = () => {
      typed = true;
    };
    el.addEventListener("keydown", markTyped);
    el.addEventListener("paste", markTyped);
    el.addEventListener("beforeinput", (e) => {
      if (e.inputType && /insertText|insertFromPaste|delete/i.test(e.inputType)) markTyped();
    });
    el.addEventListener("input", () => {
      if (!typed && durableGet(id === "gate-name" ? "lw_name" : "lw_local")) {
        fillGateFromSave();
        return;
      }
      commitHand(true);
    });
    el.addEventListener("change", () => {
      if (typed) commitHand(true);
      paintWhoName();
      netBeat();
    });
    el.addEventListener("blur", () => {
      if (typed) commitHand(true);
      else fillGateFromSave();
      paintWhoName();
    });
    el.addEventListener("keydown", (e) => {
      if (e.code === "Enter") {
        e.preventDefault();
        if (id === "gate-name") $("gate-local")?.focus();
        else $("btn-start")?.click();
      }
    });
  };
  bindGate("gate-name");
  bindGate("gate-local");
}

/* ------------------------------------------------------------------ */
/*  JOE RIVERA — east hall inside CB-4. Always mid-sentence.  */
/* ------------------------------------------------------------------ */
const JOE_POS = [CB.hallEX, 61.5]; // east long hallway, south end of pod 0
const JOE_YELL = [
  "Derek — get that fucking tray up. Not whatever that shit is.",
  "I SAID THE TRAY, NOT THE GODDAMN FLOOR. You packing a lunch or hanging pipe?",
  "That coupling's backwards, you stupid shit. Don't make me come up there.",
  "Derek. Eyes up. That strap's crooked and I can see it from here, asshole.",
  "You on my clock or theirs? Move your ass.",
  "I don't wanna see a gap in that run. Fill it or I'll fill your time sheet with a zero.",
  "Hard hats ON. I catch one more lid on a gang box and you're walking, you hear me?",
  "Derek, if that coupling backs off again you're buying lunch for the whole fucking crew.",
  "That's not a break. That's you hiding. Get the fuck back on the iron.",
  "Rivera. That's the name on the slip if this corner ain't done by lunch. So quit dicking around.",
  "You two talking or working? 'Cause I only hear one of those, and it ain't the work.",
  "Measure twice. I already measured once and you're short, genius.",
  "Don't look at the traveler. Look at the fucking work.",
  "Derek — stop staring at the traveler and put your hands on the pipe.",
  "Both of you — close that gap or you're both on the next truck home.",
  "Hey. Yeah, you with the drill. Tighter. I still see daylight, you lazy shit.",
  "Jesus Christ, Derek. That's a dogleg. Cut it out and do it again.",
  "I swear to god if I see another open box I'm writing all three of you up.",
  "Derek — I said the fucking tray. You deaf or just stupid?",
  "Put the phone away before I put it in the gang box, asshole.",
  "That's a dogleg you could drive a truck through. Cut it and do it right.",
  "Derek. I will write your ass up so hard 237 sends you home in a paper bag.",
  "Move. Now. I am not asking. Get on that iron.",
  "You hanging pipe or standing there looking pretty? Because I don't see any pipe going in.",
  "Hey. Yeah, you. That's a piss-poor coupling. Do it again before I come up there.",
];

function buildJoe() {
  const w = makeWorker("joe", { skin: 1, hair: 1, beard: true });
  w.position.set(JOE_POS[0], 0, JOE_POS[1]);
  w.rotation.y = 0.05; // facing his boys up the east hall
  const tag = makeNameTag("JOE RIVERA");
  w.add(tag);
  scene.add(w);
  w.traverse((o) => (o.userData.noBake = true));
  const guys = [
    placeWorker("oconnell", CB.hallEX + 1.4, 66.0, 0, { work: true, hold: "drill", skin: 1, hair: 0, joeGuy: true }),
    placeWorker("labor", CB.hallEX - 1.4, 67.2, 0, { work: true, skin: 0, hair: 2, joeGuy: true }),
    placeWorker("oconnell", CB.hallEX + 1.2, 68.4, 0, { work: true, hold: "drill", skin: 3, hair: 1, joeGuy: true }),
  ];
  // Derek — one of Rivera's boys on the east hall
  const derek = guys[1];
  const derekTag = makeNameTag("DEREK", "O'CONNELL");
  derekTag.scale.set(1.9, 0.48, 1);
  derekTag.position.y = 2.25;
  derek.add(derekTag);
  state.joe = { mesh: w, guys, tag, derek, inRange: false, i: 0, nextYell: 0, introduced: false };
}

function barkJoe() {
  const j = state.joe;
  if (!j) return;
  // floor talk, not the walkie — drop the radio HUD if it was up
  $("radio").classList.remove("show");
  if (!j.introduced) {
    j.introduced = true;
    speakAs("joe", "Rivera. This corner's mine — eyes on the fucking work, not the traveler. Don't test me.");
    toast("JOE RIVERA");
    return;
  }
  const line = JOE_YELL[j.i % JOE_YELL.length];
  j.i++;
  speakAs("joe", line);
}

function updateJoe(dt, t) {
  const j = state.joe;
  if (!j || !j.mesh) return;
  const m = j.mesh;
  const px = player.position.x;
  const pz = player.position.z;
  const dist = Math.hypot(px - m.position.x, pz - m.position.z);
  const vis = dist < 72;
  if (m.visible !== vis) m.visible = vis;
  if (!vis) {
    j.inRange = false;
    j.nextYell = 0;
    return;
  }
  const ud = m.userData;
  // chopping the air at his guys — louder when you're in earshot
  const hot = dist < 9 ? 1 : 0.55;
  ud.armR.rotation.x = -1.05 + Math.sin(t * 7.2) * 0.5 * hot;
  ud.armL.rotation.x = 0.15 + Math.sin(t * 3.4) * 0.22;
  m.rotation.y = 0.15 + Math.sin(t * 1.5) * 0.12;
  if (state.mode !== "play") return;
  const near = dist < 8.2;
  if (near) {
    j.nextYell -= dt;
    if (!j.inRange || j.nextYell <= 0) {
      barkJoe();
      j.nextYell = 6.2 + Math.random() * 2.4;
    }
  } else {
    j.nextYell = 0;
  }
  j.inRange = near;
}

const CHRIS_POS = [CB.hallWX, 112.4]; // west hall, north of the boombox (radio is z=66)
const CHRIS_YELL = [
  "We're gonna hang so much pipe. You're gonna get tired of hanging pipe. Believe me.",
  "This EMT? The best EMT. Nobody's ever seen EMT like this.",
  "People tell me — smart people, the best people — this panel is a disaster. We're gonna make it huge.",
  "I know conduit. I have the best conduit. Many people are saying it.",
  "Fake news that this loop is open. It's not open. It's closed. Totally closed.",
  "We're going to win so much on this hall you'll get sick of winning.",
  "Nobody knows 90s better than me. Nobody. I invent the 90.",
  "I'm from Long Island. Lighting now. O'Connell. Yuge lights. Believe me.",
  "Used to be fire alarm. O'Connell lighting now. Don't mix the books.",
  "That's a lighting circuit. I don't land fire alarm anymore. I did that. Tremendous fire alarm.",
  "This traveler — very nice person, by the way — is doing a tremendous job. Tremendous.",
  "They're saying the inspector is tough. I love the inspector. Beautiful inspection coming.",
  "I have a great brain for fire alarm. The best brain. It's true.",
  "We're going to drain the swamp. By which I mean this wet floor. Somebody get a pig.",
  "Bends so clean, so beautiful, you'll say Chris you can't do that. I did it.",
  "Many people said Book 2 can't pull. We pulled. Bigly.",
  "The trailer says we're behind. We're not behind. We're ahead. Way ahead.",
  "Believe me. This is the greatest data hall. Maybe ever.",
  "Hard hats. Very important. I have the best hard hat. Look at this hat.",
  "Squenchers? Not a fan. Water. The best water. Long Island water, maybe.",
];

function buildChris() {
  const w = makeWorker("chris", { skin: 2, hair: 4, beard: false });
  w.position.set(CHRIS_POS[0], 0, CHRIS_POS[1]);
  w.rotation.y = 3.05;
  const tag = makeNameTag("CHRIS", "O'CONNELL LIGHTING");
  w.add(tag);
  scene.add(w);
  w.traverse((o) => (o.userData.noBake = true));
  const guys = [
    placeWorker("oconnell", CB.hallWX + 1.5, 114.6, 3.1, { work: true, hold: "drill", skin: 2, hair: 1 }),
    placeWorker("labor", CB.hallWX - 1.3, 115.4, 3.1, { work: true, skin: 0, hair: 0 }),
  ];
  state.chris = { mesh: w, guys, tag, inRange: false, i: 0, nextYell: 0, introduced: false };
}

function barkChris() {
  const m = state.chris;
  if (!m) return;
  $("radio").classList.remove("show");
  if (!m.introduced) {
    m.introduced = true;
    speakAs("chris", "Chris. Lighting. O'Connell. Used to run fire alarm. Tremendous hall. Believe me.");
    toast("CHRIS · LIGHTING");
    return;
  }
  const line = CHRIS_YELL[m.i % CHRIS_YELL.length];
  m.i++;
  speakAs("chris", line);
}

function updateChris(dt, t) {
  const mk = state.chris;
  if (!mk || !mk.mesh) return;
  const mesh = mk.mesh;
  const px = player.position.x;
  const pz = player.position.z;
  const dist = Math.hypot(px - mesh.position.x, pz - mesh.position.z);
  const vis = dist < 72;
  if (mesh.visible !== vis) mesh.visible = vis;
  if (!vis) {
    mk.inRange = false;
    mk.nextYell = 0;
    return;
  }
  const ud = mesh.userData;
  const hot = dist < 10 ? 1 : 0.5;
  if (ud && ud.armR) {
    ud.armR.rotation.x = -0.7 + Math.sin(t * 2.2) * 0.35 * hot;
    ud.armL.rotation.x = 0.2 + Math.sin(t * 1.6) * 0.18;
  }
  mesh.rotation.y = 3.05 + Math.sin(t * 0.9) * 0.18;
  if (state.mode !== "play") return;
  const near = dist < 9.0;
  if (near) {
    mk.nextYell -= dt;
    if (!mk.inRange || mk.nextYell <= 0) {
      barkChris();
      mk.nextYell = 7.5 + Math.random() * 3.0;
    }
    mk.inRange = true;
  } else {
    mk.nextYell = 0;
    mk.inRange = false;
  }
}

const DON_HOME = [12.6, 18.2];
const DON_YELL = [
  "Give me back my side by side!",
  "I didn't say you could take the Razor!",
  "Those are company keys! MY company keys!",
  "Get back here with my SXS!",
  "You wreck that and you're buying it out of pocket!",
  "Drew's gonna hear about this joyride!",
  "That's not a toy! Okay it is. It's MY toy!",
  "Park it! Park it right now!",
  "Don't you take that to the landfill!",
  "I was gonna eat lunch in that thing!",
  "Foreman vehicle! Says so on the clipboard!",
  "You hop in my seat like you pay the note!",
];

function buildDon() {
  const w = makeWorker("foreman", { skin: 2, hair: 1, beard: true, hold: "radio" });
  w.position.set(DON_HOME[0], 0, DON_HOME[1]);
  w.rotation.y = -0.4;
  const tag = makeNameTag("DON", "THE FOREMAN");
  tag.position.y = 2.5;
  tag.scale.set(3.0, 0.75, 1);
  if (tag.material) tag.material.fog = false;
  w.add(tag);
  scene.add(w);
  w.traverse((o) => (o.userData.noBake = true));
  state.don = { mesh: w, tag, mode: "idle", i: 0, nextYell: 0, stuck: 0, lastX: DON_HOME[0], lastZ: DON_HOME[1], caught: false };
}

function barkDon(intro) {
  const d = state.don;
  if (!d) return;
  let line;
  if (intro) line = "Hey! That's my side-by-side!";
  else {
    line = DON_YELL[d.i % DON_YELL.length];
    d.i++;
  }
  speakAs("don", line);
  toast("DON THE FOREMAN");
}

function barkDonPark() {
  speakAs("don", "That's what I thought. Walk next time.");
  toast("DON THE FOREMAN");
}

function donChaseWalk(rec, tx, tz, sp, dt) {
  const m = rec.mesh;
  const vx = tx - m.position.x;
  const vz = tz - m.position.z;
  const dist = Math.hypot(vx, vz) || 0.001;
  if (dist < 1.1) return dist;
  let nx = m.position.x + (vx / dist) * sp * dt;
  let nz = m.position.z + (vz / dist) * sp * dt;
  for (const b of state.colliders) {
    if (b.h < 4.2) continue;
    const cx = Math.max(b.minx, Math.min(nx, b.maxx));
    const cz = Math.max(b.minz, Math.min(nz, b.maxz));
    let ddx = nx - cx;
    let ddz = nz - cz;
    const d2 = ddx * ddx + ddz * ddz;
    if (d2 < 0.18) {
      const dd = Math.sqrt(d2) || 0.0001;
      nx += (ddx / dd) * (0.42 - dd + 0.001);
      nz += (ddz / dd) * (0.42 - dd + 0.001);
    }
  }
  m.position.x = nx;
  m.position.z = nz;
  m.rotation.y = Math.atan2(vx, vz);
  if (Math.hypot(nx - rec.lastX, nz - rec.lastZ) < sp * dt * 0.2) rec.stuck += dt;
  else rec.stuck = 0;
  rec.lastX = nx;
  rec.lastZ = nz;
  if (rec.stuck > 1.2) {
    rec.stuck = 0;
    m.position.x += (vx / dist) * 4;
    m.position.z += (vz / dist) * 4;
  }
  const ud = m.userData;
  if (ud && ud.legL) {
    const w = performance.now() * 0.014;
    ud.legL.rotation.x = Math.sin(w + Math.PI) * 0.7;
    ud.legR.rotation.x = Math.sin(w) * 0.7;
    ud.armL.rotation.x = Math.sin(w) * 0.55;
    if (ud.armR) ud.armR.rotation.x = -0.8 + Math.sin(w) * 0.25;
  }
  return dist;
}

function updateDon(dt, t) {
  const d = state.don;
  if (!d || !d.mesh) return;
  const m = d.mesh;
  const px = player.position.x;
  const pz = player.position.z;
  const dist = Math.hypot(px - m.position.x, pz - m.position.z);
  if (m.visible !== dist < 110) m.visible = dist < 110;
  if (state.mode !== "play") return;
  const chasing = !!dayState.utv;
  if (chasing) {
    if (d.mode !== "chase") {
      d.mode = "chase";
      d.nextYell = 0.15;
      d.caught = false;
      barkDon(true);
    }
    donChaseWalk(d, px, pz, 9.4, dt);
    d.nextYell -= dt;
    if (d.nextYell <= 0) {
      barkDon(false);
      d.nextYell = 4.2 + Math.random() * 2.4;
    }
    if (dist < 3.4 && !d.caught) {
      d.caught = true;
      toast("DON'S ON YOUR BUMPER", true);
    }
    if (dist > 7) d.caught = false;
    return;
  }
  if (d.mode === "chase") {
    d.mode = "home";
    barkDonPark();
  }
  const hx = DON_HOME[0];
  const hz = DON_HOME[1];
  const hd = Math.hypot(m.position.x - hx, m.position.z - hz);
  if (hd > 1.3) {
    npcWalk(d, hx, hz, 3.6, dt);
  } else {
    d.mode = "idle";
    m.position.x = hx;
    m.position.z = hz;
    m.rotation.y = -0.4 + Math.sin(t * 0.8) * 0.15;
    const ud = m.userData;
    if (ud && ud.legL) {
      ud.legL.rotation.x = 0;
      ud.legR.rotation.x = 0;
    }
  }
}


function drewLegs(w) {
  const ud = state.drew.mesh.userData;
  ud.legL.rotation.x = Math.sin(w + Math.PI) * 0.6;
  ud.legR.rotation.x = Math.sin(w) * 0.6;
  ud.armL.rotation.x = Math.sin(w) * 0.5;
  // armR keeps the clipboard up
}

/* per-day live mechanics: the AHJ's walk, the thirsty genny, punch hints,
   and the moving sign-off targets */
function updateDayMechanics(dt, t) {
  // Utah's cart tails him when he's pushing it (any day)
  if (dayState.pushCart && state.cart && !dayState.driving) {
    state.cart.position.x = player.position.x + Math.sin(facing) * 1.25;
    state.cart.position.z = player.position.z + Math.cos(facing) * 1.25;
    state.cart.rotation.y = facing;
  }
  for (const it of state.interactables) {
    if (it.candy && state.cart) {
      // the bag rides the cart's nose — walk it up to the crew
      it.x = state.cart.position.x + Math.sin(state.cart.rotation.y) * 0.9;
      it.z = state.cart.position.z + Math.cos(state.cart.rotation.y) * 0.9;
    } else if (it.andyFund && state.andy) {
      it.x = state.andy.position.x;
      it.z = state.andy.position.z;
    } else if (it.cartGrab && state.cart) {
      if (dayState.pushCart) {
        // handle's in Utah's hand: face the bag to share candy, look away to let go
        it.x = player.position.x - Math.sin(facing) * 0.6;
        it.z = player.position.z - Math.cos(facing) * 0.6;
      } else {
        it.x = state.cart.position.x - Math.sin(state.cart.rotation.y) * 1.15;
        it.z = state.cart.position.z - Math.cos(state.cart.rotation.y) * 1.15;
      }
      it.label = dayState.pushCart
        ? "Park the cart"
        : getTraveler() === "tremont"
          ? "Push the cart"
          : "Push Utah's cart";
    } else if (it.liftDrive && state.driveLift) {
      it.x = state.driveLift.mesh.position.x;
      it.z = state.driveLift.mesh.position.z;
      it.label = dayState.driving
        ? dayState.liftH > 0.5
          ? "Lower it, then step off"
          : "Step off the scissor"
        : "Run the blue scissor";
    } else if (it.utv && it.utvRef && it.utvRef.mesh) {
      it.x = it.utvRef.mesh.position.x;
      it.z = it.utvRef.mesh.position.z;
      it.label = dayState.utv === it.utvRef ? "Park the side-by-side" : "Hop in the side-by-side";
    }
  }
  if (cycleDay(day) === 3) {
    const a = state.ahjNpc;
    if (!a) return;
    if (!state.done.tools) {
      npcWalk(a, 2, 8, 1.4, dt); // he waits at the gate until you're on the clock
      return;
    }
    const demos = state.interactables.filter((i) => i.demo);
    while (dayState.ahjIdx < demos.length && demos[dayState.ahjIdx].done) {
      dayState.ahjIdx++;
      dayState.ahjDwell = 0;
    }
    if (dayState.ahjIdx >= demos.length) {
      npcWalk(a, 2, 8, 1.6, dt); // his work's done — back to the lot
      return;
    }
    if (dayState.ahjHold > 0) {
      dayState.ahjHold -= dt; // pen out, clipboard up
      return;
    }
    const target = demos[dayState.ahjIdx];
    if (target.marker && !target.done) {
      target.marker.material.color.setHex(0x4a9eff); // blue = he's headed there
      target.marker.visible = true;
    }
    const d = npcWalk(a, target.x, target.z, weekOfDay(day) >= 2 ? 2.35 : 1.9, dt);
    if (d < 1.8) {
      dayState.ahjDwell += dt;
      if (dayState.ahjDwell > (weekOfDay(day) >= 2 ? 8 : 12)) {
        dayState.ahjDwell = 0;
        dayState.corrections++;
        if (target.marker) target.marker.material.color.setHex(0xffb03a);
        toast("CORRECTION ×" + dayState.corrections, true);
        vib(80);
        track("ahj_correction", { n: dayState.corrections });
        if (dayState.corrections >= 3) {
          fail("inspection");
          return;
        }
        dayState.ahjHold = 6; // he stands there writing — your travel window
        radioFore(
          dayState.corrections === 2
            ? "That's two corrections. One more and he red-tags the whole job."
            : "AHJ wrote one up. Get AHEAD of him, Utah.",
          dayState.corrections === 2
            ? "That's two corrections. One more and he red-tags the whole job."
            : "Inspector wrote one up. Get AHEAD of him, Tremont."
        );
        dayState.ahjIdx++;
      }
    } else {
      dayState.ahjDwell = Math.max(0, dayState.ahjDwell - dt * 0.5);
    }
  } else if (cycleDay(day) === 4) {
    if (!dayState.genTransferred) {
      dayState.genT -= dt * (weekOfDay(day) >= 2 ? 1.28 : 1);
      if (dayState.genT < 0) dayState.genT = 0;
      if (dayState.genT <= 0 && !dayState.genWarned) {
        dayState.genWarned = true;
        radioFore(
          "She's dead. Headlamp only until somebody fuels the diesel east of the south doors.",
          "Genny's dead. Lamp only. Fuel the diesel east of the south doors, then get back on the sensors."
        );
        toast("LIGHTS OUT", true);
        vib(60);
      }
      if (dayState.genT > 0) dayState.genWarned = false;
      if (dayState.genT < 18 && dayState.genT > 0 && !dayState.genLow) {
        dayState.genLow = true;
        radioFore(
          "Genny's coughing. South doors. Fuel her before the halls go black.",
          "Genny's coughing. South doors. Fuel her. Don't work in the dark."
        );
      }
      if (dayState.genT >= 18) dayState.genLow = false;
    }
    applyNightPower(t);
    if (state.genny) {
      const it = state.interactables.find((i) => i.genny);
      if (it) {
        it.x = state.genny.position.x;
        it.z = state.genny.position.z;
        it.label = dayState.genTransferred ? "Genny's off — utility's back" : dayState.genT <= 0 ? "Fuel the genny — halls are dark" : "Fuel the genny";
      }
    }
  } else if (cycleDay(day) === 6) {
    // punch items reveal only up close — the list is the map
    const signReady = jobReady("sign") && !state.done.sign;
    const punchLeft = state.interactables.find((i) => i.punch && !i.done);
    const highLeft = JOBS.some((j) => j.id === "high") && !state.done.high;
    for (const it of state.interactables) {
      if (it.punch && it.marker) {
        it.marker.visible = !it.done && Math.hypot(player.position.x - it.x, player.position.z - it.z) < 9;
      }
      if (it.sign && state.drew) {
        it.x = state.drew.mesh.position.x;
        it.z = state.drew.mesh.position.z;
        if (it.marker) {
          it.marker.visible = signReady;
          placeWorkMarker(it.marker, it.x, it.z, 2.85);
        }
      }
    }
    // Compass stays off during the hunt; it comes back for high work and Drew
    $("compass").classList.toggle("hidden", !!punchLeft);
    let hint = null;
    if (punchLeft) hint = punchLeft.hint;
    else if (highLeft) hint = "High punch — west tilt-up. Bring the blue scissor.";
    else if (signReady) hint = "Find Drew — south yard. White hard hat, clipboard, orange diamond.";
    if (hint !== ui.hint) {
      ui.hint = hint;
      if (hint) {
        $("job-line").textContent = hint;
        $("punch-hint").textContent = (punchLeft ? "PUNCH: " : "") + hint;
        $("punch-hint").classList.remove("hidden");
      } else {
        $("punch-hint").classList.add("hidden");
      }
    }
  } else if (cycleDay(day) === 7) {
    const wantSign = state.done.checks && !state.done.signoffs;
    for (const it of state.interactables) {
      if (it.sign === "lugo" && state.lugoMesh) {
        it.x = state.lugoMesh.position.x;
        it.z = state.lugoMesh.position.z;
      } else if (it.sign === "drew" && state.drew) {
        it.x = state.drew.mesh.position.x;
        it.z = state.drew.mesh.position.z;
      } else if (it.sign === "ahj" && state.ahjNpc) {
        it.x = state.ahjNpc.mesh.position.x;
        it.z = state.ahjNpc.mesh.position.z;
      }
      if (it.sign && it.marker) {
        it.marker.visible = !it.done && wantSign;
        it.marker.position.x = it.x;
        it.marker.position.z = it.z;
      }
    }
    if (state.lugoRec) {
      const lm = state.lugoMesh;
      state.lugoRec.pause =
        wantSign && lm && Math.hypot(player.position.x - lm.position.x, player.position.z - lm.position.z) < 5;
    }
    const nxt = state.interactables.find((i) => i.id === (currentJob() && currentJob().id) && !i.done);
    let hint = null;
    if (nxt && nxt.check) hint = "Final check — follow the diamond";
    else if (nxt && nxt.sign === "lugo") hint = "SIGN: " + foremanName() + " — corridor";
    else if (nxt && nxt.sign === "drew") hint = "SIGN: Drew — south yard";
    else if (nxt && nxt.sign === "ahj") hint = isTremont() ? "SIGN: inspector — at the gear" : "SIGN: AHJ — at the FACP";
    else if (currentJob() && currentJob().id === "facp") hint = "ENERGIZE — corridor, pod 1";
    if (hint !== ui.hint) {
      ui.hint = hint;
      if (hint) {
        $("job-line").textContent = hint;
        $("punch-hint").textContent = hint;
        $("punch-hint").classList.remove("hidden");
      } else {
        $("punch-hint").classList.add("hidden");
      }
    }
  }
}

function startDrewChase() {
  const d = state.drew;
  if (!d || d.mode === "chase") return;
  if (state.lugoRec) state.lugoRec.pause = false; // huddle's over — someone's slow
  clearTimeout(state.huddleTimer);
  d.mode = "chase";
  d.mesh.position.set(-26, 0, 10); // steps off the trailer
  d.stuck = 0;
  toast("DREW'S WALKING", true);
  radioFore(
    "That's overtime. Drew's off the trailer with paperwork. Land this loop NOW.",
    "That's overtime. Drew's off the trailer. Finish the circuits NOW. No posing."
  );
  clearTimeout(state.drewBark);
  state.drewBark = setTimeout(() => {
    if (state.drew && state.drew.mode === "chase") {
      radio(drewLine("Utah. Clipboard's out. Don't make me write this slip."), "drew");
    }
  }, 3800);
  track("drew_walking", { pts: state.watts });
}

function startHuddle() {
  const d = state.drew;
  d.mode = "huddle";
  d.huddleT = 8;
  if (state.lugoRec) state.lugoRec.pause = true;
  const first = state.huddleN === 1;
  if (first) radio(drewLine(isTremont() ? "How we looking on the circuits, Lemon?" : "How we looking on the loop, Lugo?"), "drew");
  else radioFore(
    "Utah's cart has more candy than a gas station.",
    "Tremont doesn't run a candy cart. Keep it that way."
  );
  clearTimeout(state.huddleTimer);
  state.huddleTimer = setTimeout(() => {
    if (state.mode !== "play") return;
    if (first) {
      radioFore(
        "Devices are flying, Drew. Y'all will have it by walk time.",
        "Devices are landing, Drew. We'll have it by walk time."
      );
    } else {
      radio(
        isTremont()
          ? "Fine. Keep the numbers moving and I don't care what he drinks."
          : "Long as the work's clean, he can sell snow cones.",
        "drew"
      );
    }
  }, 3100);
  track("huddle", { n: state.huddleN });
}

function drewWantsSign() {
  if (!state.drew) return false;
  if (cycleDay(day) === 6 && jobReady("sign") && !state.done.sign) return true;
  if (cycleDay(day) === 7 && jobReady("signoffs") && !state.done.signoffs) return true;
  return false;
}

function updateDrew(dt, t) {
  const d = state.drew;
  if (!d) return;
  const m = d.mesh;
  m.visible = true;
  // When the slip is ready, Drew plants in the south yard so the level can finish
  if (drewWantsSign() && d.mode !== "done") {
    const tx = DREW_PATROL[0][0];
    const tz = DREW_PATROL[0][1];
    const dist = Math.hypot(m.position.x - tx, m.position.z - tz);
    if (dist > 1.4) {
      npcWalk(d, tx, tz, 2.2, dt);
    } else {
      m.position.x = tx;
      m.position.z = tz;
      const px = player.position.x - m.position.x;
      const pz = player.position.z - m.position.z;
      if (Math.hypot(px, pz) < 8) m.rotation.y = Math.atan2(px, pz);
      const ud = m.userData;
      if (ud && ud.legL) {
        ud.legL.rotation.x = 0;
        ud.legR.rotation.x = 0;
      }
    }
    return;
  }
  // twice a shift the GF walks the hall to check in with his foreman
  if (d.mode === "patrol" && state.lugoMesh) {
    if (!state.huddleN && state.time < shiftLen * 0.72) {
      state.huddleN = 1;
      d.mode = "visit";
      d.stuck = 0;
    } else if (state.huddleN === 1 && state.time < shiftLen * 0.38) {
      state.huddleN = 2;
      d.mode = "visit";
      d.stuck = 0;
    }
  }
  if (d.mode === "visit" || d.mode === "return") {
    let tx = d.mode === "visit" ? state.lugoMesh.position.x : DREW_PATROL[0][0];
    let tz = d.mode === "visit" ? state.lugoMesh.position.z : DREW_PATROL[0][1];
    // the main south door on the corridor — Drew uses it to visit the hall
    const inside = m.position.z > CB.z0;
    const targetInside = tz > CB.z0;
    let atDoor = false;
    if (inside !== targetInside) {
      tx = CB.corX;
      tz = inside ? CB.z0 - 2.5 : CB.z0 + 2.5;
      atDoor = true;
    }
    // npcWalk slides Drew along the floor colliders and un-sticks him at doors
    const dist = npcWalk(d, tx, tz, 1.7, dt);
    d.visitT = (d.visitT || 0) + dt;
    if (d.visitT > 75) {
      // whatever's in the way, the GF gives up and goes back to his numbers
      d.visitT = 0;
      if (state.lugoRec) state.lugoRec.pause = false;
      d.mode = "return";
      m.position.set(CB.corX, 0, CB.z0 - 2.5);
      return;
    }
    if (dist < 2.3 && !atDoor) {
      d.visitT = 0;
      if (d.mode === "visit") startHuddle();
      else {
        d.mode = "patrol";
        d.i = 0;
        d.u = 0;
      }
    }
    return;
  }
  if (d.mode === "huddle") {
    const lm = state.lugoMesh;
    if (lm) {
      m.rotation.y = Math.atan2(lm.position.x - m.position.x, lm.position.z - m.position.z);
      lm.rotation.y = m.rotation.y + Math.PI;
    }
    const ud = m.userData;
    ud.legL.rotation.x = 0;
    ud.legR.rotation.x = 0;
    ud.armL.rotation.x = Math.sin(t * 1.7) * 0.12;
    d.huddleT -= dt;
    if (d.huddleT <= 0) {
      if (state.lugoRec) state.lugoRec.pause = false;
      d.mode = "return";
      d.stuck = 0;
    }
    return;
  }
  if (d.mode === "patrol") {
    if (cycleDay(day) === 7 && state.done.checks && !state.done.signoffs) {
      const dist = Math.hypot(player.position.x - m.position.x, player.position.z - m.position.z);
      if (dist < 5) {
        m.rotation.y = Math.atan2(player.position.x - m.position.x, player.position.z - m.position.z);
        const ud = m.userData;
        ud.legL.rotation.x = 0;
        ud.legR.rotation.x = 0;
        return;
      }
    }
    const a = DREW_PATROL[d.i];
    const b = DREW_PATROL[(d.i + 1) % DREW_PATROL.length];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz) || 1;
    d.u += (1.15 * dt) / len;
    if (d.u >= 1) {
      d.u -= 1;
      d.i = (d.i + 1) % DREW_PATROL.length;
    }
    m.position.x = a[0] + dx * d.u;
    m.position.z = a[1] + dz * d.u;
    m.rotation.y = Math.atan2(dx, dz);
    drewLegs(t * 8);
    return;
  }
  if (d.mode !== "chase") return;
  const px = player.position.x;
  const pz = player.position.z;
  let vx = px - m.position.x;
  let vz = pz - m.position.z;
  const dist = Math.hypot(vx, vz) || 0.001;
  if (dist < 1.15) {
    d.mode = "done";
    fail("slip");
    return;
  }
  const sp = 2.3;
  let nx = m.position.x + (vx / dist) * sp * dt;
  let nz = m.position.z + (vz / dist) * sp * dt;
  // slide along the same colliders the player uses (Drew walks the floor)
  for (const b of state.colliders) {
    if (b.y > 0.5) continue;
    const cx = Math.max(b.minx, Math.min(nx, b.maxx));
    const cz = Math.max(b.minz, Math.min(nz, b.maxz));
    let ddx = nx - cx;
    let ddz = nz - cz;
    const d2 = ddx * ddx + ddz * ddz;
    if (d2 < 0.16) {
      const dd = Math.sqrt(d2);
      if (dd < 1e-6) {
        // center inside the box — push out through the nearest face
        const fw = nx - b.minx, fe = b.maxx - nx, fs = nz - b.minz, fn = b.maxz - nz;
        const fm = Math.min(fw, fe, fs, fn);
        if (fm === fw) nx = b.minx - 0.401;
        else if (fm === fe) nx = b.maxx + 0.401;
        else if (fm === fs) nz = b.minz - 0.401;
        else nz = b.maxz + 0.401;
        continue;
      }
      nx += (ddx / dd) * (0.4 - dd + 0.001);
      nz += (ddz / dd) * (0.4 - dd + 0.001);
    }
  }
  m.position.x = nx;
  m.position.z = nz;
  m.rotation.y = Math.atan2(vx, vz);
  drewLegs(t * 9);
  // walls can pin him — a GF knows every door on this site
  if (Math.hypot(nx - d.lastX, nz - d.lastZ) < sp * dt * 0.25) d.stuck += dt;
  else d.stuck = 0;
  d.lastX = nx;
  d.lastZ = nz;
  if (d.stuck > 2.5) {
    d.stuck = 0;
    m.position.x = px + ((m.position.x - px) / dist) * 14;
    m.position.z = pz + ((m.position.z - pz) / dist) * 14;
  }
}

function buildForklift() {
  const g = new THREE.Group();
  const body = boxMesh(1.3, 1.1, 2.2, mats.yellow);
  body.position.y = 0.7;
  const cage = boxMesh(1.1, 1.0, 0.1, mats.dark);
  cage.position.set(0, 1.5, -0.9);
  const mast = boxMesh(0.12, 2.0, 0.12, mats.dark);
  mast.position.set(-0.4, 1.4, 1.0);
  const mast2 = mast.clone();
  mast2.position.x = 0.4;
  const fork = boxMesh(0.9, 0.08, 1.3, mat(0x888));
  fork.position.set(0, 0.25, 1.6);
  g.add(body, cage, mast, mast2, fork);
  g.position.set(-6, 0, 20);
  scene.add(g);
  g.traverse((o) => (o.userData.noBake = true));
  state.forklift = { mesh: g, t: 0, dir: 1 };
}

function buildRacks() {
  const dummy = new THREE.Object3D();
  const rackW = 0.6;
  const rackD = 1.08;
  const rackH = 2.2;
  const westX = CB.dataX - 2.28;
  const eastX = CB.dataX + 2.28;
  const nPer = 9;
  const pitch = 0.68;

  const rackTex = loader.load("/assets/tex_rack.jpg?v=120");
  rackTex.colorSpace = THREE.SRGBColorSpace;
  const crahTex = loader.load("/assets/tex_crah.jpg?v=120");
  crahTex.colorSpace = THREE.SRGBColorSpace;
  // sealed concrete slab — this site has NO raised floor; power and data
  // run in the overhead tray (see assets/ref_mech.jpg / ref_elec.jpg)
  const floorTex = loader.load("/assets/tex_concrete.jpg?v=120");
  floorTex.colorSpace = THREE.SRGBColorSpace;
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(8, 12);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(CB.data1 - CB.data0 - 0.3, CB.z1 - CB.z0 - 0.3),
    new THREE.MeshLambertMaterial({ map: floorTex, color: 0xc9c7c1 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(CB.dataX, 0.02, (CB.z0 + CB.z1) / 2);
  floor.userData.noBake = true;
  scene.add(floor);

  const spots = [];
  for (let i = 0; i < CB.pods; i++) {
    const { mid } = podBand(i);
    const zStart = mid - ((nPer - 1) * pitch) / 2;
    for (const side of [-1, 1]) {
      const x = side < 0 ? westX : eastX;
      let runA = null;
      let runB = null;
      const flush = () => {
        if (runA == null) return;
        addCollider(x, (runA + runB) / 2, rackD + 0.1, runB - runA + rackW, 0, rackH);
        runA = runB = null;
      };
      for (let k = 0; k < nPer; k++) {
        if (k === 4) {
          flush();
          continue;
        }
        const z = zStart + k * pitch;
        spots.push({ x, z, side, pod: i });
        if (runA == null) runA = z;
        runB = z;
      }
      flush();
    }

    // CRAHs dump into the cold aisles — west & east walls of DATA
    for (const [cx, yaw] of [
      [CB.data0 + 0.62, 0],
      [CB.data1 - 0.62, Math.PI],
    ]) {
      const g = new THREE.Group();
      const body = boxMesh(0.88, 2.18, 1.72, mats.crah);
      body.position.y = 1.09;
      g.add(body);
      const face = new THREE.Mesh(
        new THREE.PlaneGeometry(1.64, 2.08),
        new THREE.MeshBasicMaterial({ map: crahTex })
      );
      face.position.set(0.45, 1.1, 0);
      face.rotation.y = -Math.PI / 2;
      g.add(face);
      const boot = boxMesh(0.92, 0.08, 1.76, mats.dark);
      boot.position.y = 0.04;
      g.add(boot);
      g.position.set(cx, 0, mid);
      g.rotation.y = yaw;
      g.userData.noBake = true;
      scene.add(g);
      addCollider(cx, mid, 1.0, 1.8, 0, 2.2);
    }

  }

  const n = spots.length;
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x16181c });
  const bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(rackD, rackH, rackW), bodyMat, n);
  const doorMat = new THREE.MeshBasicMaterial({ map: rackTex });
  const doors = new THREE.InstancedMesh(new THREE.PlaneGeometry(rackW * 0.96, rackH * 0.92), doorMat, n);
  const rearMat = new THREE.MeshLambertMaterial({ color: 0x2a2e34 });
  const rears = new THREE.InstancedMesh(new THREE.BoxGeometry(0.04, rackH * 0.9, rackW * 0.92), rearMat, n);

  spots.forEach((s, i) => {
    dummy.position.set(s.x, rackH / 2, s.z);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    bodies.setMatrixAt(i, dummy.matrix);

    const faceX = s.x - s.side * (rackD / 2 + 0.012);
    dummy.position.set(faceX, rackH / 2 + 0.02, s.z);
    dummy.rotation.set(0, s.side < 0 ? -Math.PI / 2 : Math.PI / 2, 0);
    dummy.updateMatrix();
    doors.setMatrixAt(i, dummy.matrix);

    dummy.position.set(s.x + s.side * (rackD / 2 + 0.01), rackH / 2, s.z);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    rears.setMatrixAt(i, dummy.matrix);

    if (i % 4 === 0) {
      const led = boxMesh(
        0.05,
        0.14,
        0.05,
        new THREE.MeshLambertMaterial({ color: 0x143018, emissive: 0x000000 })
      );
      led.position.set(faceX, 1.95, s.z);
      led.userData.noBake = true;
      scene.add(led);
      state.racks.push(led);
    }
  });
  bodies.userData.noBake = true;
  doors.userData.noBake = true;
  rears.userData.noBake = true;
  scene.add(bodies, doors, rears);

  // high-bays — white over cold aisles, no extra PointLights
  const bayGeo = new THREE.BoxGeometry(1.35, 0.08, 0.42);
  const bayMat = new THREE.MeshBasicMaterial({ color: 0xf3eee0 });
  const baySpots = [];
  for (let i = 0; i < CB.pods; i++) {
    const { mid } = podBand(i);
    for (const bx of [CB.dataX - 8.5, CB.dataX + 8.5]) {
      for (let k = -2; k <= 2; k++) baySpots.push([bx, 7.82, mid + k * 3.2]);
    }
  }
  const bays = new THREE.InstancedMesh(bayGeo, bayMat, baySpots.length);
  baySpots.forEach((p, i) => {
    dummy.position.set(p[0], p[1], p[2]);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    bays.setMatrixAt(i, dummy.matrix);
  });
  bays.userData.noBake = true;
  scene.add(bays);
}

/* ------------------------------------------------------------------ */
/*  MISSIONS / INTERACT                                                */
/* ------------------------------------------------------------------ */
function faLoopReady() {
  return JOBS.filter((j) => j.fa && j.id !== "facp").every((j) => state.done[j.id]);
}

function jobReady(id) {
  if (id === "tools") return true;
  if (id === "coffee") return true;
  if (String(id).startsWith("utv")) return true;
  if (id === "store") return true;
  if (id === "genny") return true;
  if (!state.done.tools) return false;
  if (id === "facp") return faLoopReady();
  if (id === "term") return state.done.reels && state.done.pulls;
  if (id === "sign") return state.done.punch && (!JOBS.some((j) => j.id === "high") || state.done.high);
  if (id === "signoffs") return state.done.checks;
  return true;
}

function currentJob() {
  return JOBS.find((j) => !state.done[j.id]);
}

function refreshJobs() {
  const box = $("jobs");
  box.innerHTML = "";
  const cur = currentJob();
  JOBS.forEach((j) => {
    const el = document.createElement("div");
    el.className =
      "job" +
      (j.fa && !isTremont() ? " fa" : "") +
      (state.done[j.id] ? " done" : cur && cur.id === j.id ? " active" : "");
    el.innerHTML = `<img src="${iconURL[j.id] || "/assets/" + j.icon}" alt="" /><span class="lab">${jobDisplayName(j)}</span><span class="n">${state.progress[j.id]}/${needFor(j.id)}</span>`;
    box.appendChild(el);
  });
  if (cur) $("job-line").textContent = jobDisplayName(cur);
  else $("job-line").textContent = isTremont() ? "Circuits are live" : "Loop is live";
  if (cycleDay(day) === 4 && !dayState.genTransferred && dayState.genT < 22 && state.hasTools) {
    $("job-line").textContent = "FEED THE GENNY · SOUTH DOORS";
  }
  ui.hint = undefined; // day-6 punch hint reasserts itself next frame
}

function needFor(id) {
  const spec = JOBS.find((j) => j.id === id);
  if (!spec) return 1;
  return (state.needs && state.needs[id]) ?? spec.need;
}

function tremontOnWork() {
  if (getTraveler() !== "tremont") return;
  dayState.workoutT = 1.85;
  const lines = [
    "Push-up set. Then the device.",
    "Chest to the deck. Circuit can wait two seconds.",
    "Form over force. Same as a clean 90.",
    "Who's skipping leg day on my site?",
    "Gym after the whistle. This set is just to stay honest.",
    "Strong people. Strong community. Strong circuit.",
    "I didn't buy that F-150 to sit in the lot all shift.",
    "Truck's a Ford. Work's a set. Don't mix 'em up.",
    "Water and iron. Then we land the device.",
    "If you brought a Squencher, drink it over there.",
    "Don't hand me a Squencher. I'll finish this set first.",
    "Squenchers are poison. Water and iron.",
  ];
  const toasts = ["SET. THEN WORK.", "FORM OVER FORCE", "WATER AND IRON", "FORD IN THE LOT", "SQUENCHERS ARE POISON"];
  speakAs("tremont", lines[Math.floor(Math.random() * lines.length)]);
  toast(toasts[Math.floor(Math.random() * toasts.length)]);
}

function completeTick(id, label, watts) {
  state.progress[id] = Math.min(needFor(id), state.progress[id] + 1);
  state.combo += 1;
  addWatts(watts, label);
  sfx("pickup");
  vib(12);
  tremontOnWork();
  const spec = JOBS.find((j) => j.id === id);
  if (state.progress[id] >= needFor(id) && !state.done[id]) {
    state.done[id] = true;
    state.combo += 2;
    addWatts(400, jobDisplayName(spec).toUpperCase());
    sfx("ok");
    if (getTraveler() === "tremont") {
      if (TREMONT_LINE[id]) speakAs("tremont", TREMONT_LINE[id]);
    } else if (UTAH_LINE[id]) {
      speakAs("utah", UTAH_LINE[id]);
    }
    const line = jobCompleteRadio(id);
    if (line) setTimeout(() => {
      if (state.mode === "play" || state.mode === "end") radio(line);
    }, 2200);
    if (cycleDay(day) === 4 && id === "facp") {
      dayState.genTransferred = true;
      applyNightPower();
    }
  }
  refreshJobs();
  if (JOBS.every((j) => state.done[j.id])) win();
  else saveCheckpoint();
}

function tryInteract() {
  if (state.mode !== "play") return;
  let it = state.nearest;
  // Standing on Drew is the sign-off — don't lose the finish to "GO BILLS"
  if (state.drew) {
    const dm = state.drew.mesh;
    const nearDrew = Math.hypot(player.position.x - dm.position.x, player.position.z - dm.position.z) < 3.4;
    if (nearDrew) {
      if (cycleDay(day) === 6 && jobReady("sign") && !state.done.sign) {
        it = state.interactables.find((i) => i.id === "sign" && !i.done) || it;
      } else if (cycleDay(day) === 7 && jobReady("signoffs") && !state.done.signoffs) {
        it = state.interactables.find((i) => i.sign === "drew" && !i.done) || it;
      }
    }
  }
  if (!it || it.done) {
    if (!(cycleDay(day) === 7 && currentJob() && currentJob().id === "signoffs")) {
    // no work in reach — but maybe Utah's bothering the general foreman
    if (state.drew && !state._billsCd) {
      const dm = state.drew.mesh;
      if (Math.hypot(player.position.x - dm.position.x, player.position.z - dm.position.z) < 2.6) {
        state._billsCd = true;
        setTimeout(() => (state._billsCd = false), 5000);
        toast("GO BILLS");
        radio(drewLine("Bills by 30, Utah. Now get back on the hall."), "drew");
        vib(20);
        track("egg_bills", {});
        return;
      }
    }
    // or bothering the foreman
    if (state.lugoMesh && !state._lugoCd) {
      const lm = state.lugoMesh;
      if (Math.hypot(player.position.x - lm.position.x, player.position.z - lm.position.z) < 2.6) {
        state._lugoCd = true;
        setTimeout(() => (state._lugoCd = false), 9000);
        radio(foremanChat()[Math.floor(Math.random() * foremanChat().length)]);
        vib(15);
        track("egg_lugo", {});
      }
    }
    }
    return;
  }
  if (!jobReady(it.id)) {
    if (!state.hasTools) {
      toast("GRAB YOUR POUCH FIRST", true);
      radioFore(
        "Pouch first, Utah. Crib's by the orange conex. I got your time — you get the work.",
        "Pouch first, Tremont. Crib's by the orange conex. Put it on, then work."
      );
    } else if (it.id === "facp") {
      toast(isTremont() ? "CIRCUITS OPEN" : "LOOP'S OPEN", true);
      radioFore(
        "Conduit, boxes, smokes, strobes, pulls, then the VESDAs in the fan crawl. Then you touch my panel.",
        "EMT, boxes, lights, recs and switches first. Then you touch my gear."
      );
    } else if (it.id === "term") {
      toast("REELS AND PULLS FIRST", true);
      radioFore(
        "Riser lands LAST, y'all. Stage the reels, pull the sections, then bring it home.",
        "Feeder lands LAST. Stage the reels, pull the sections, then bring it home."
      );
    } else if (it.id === "sign") {
      toast("CLEAR THE PUNCH LIST FIRST", true);
      radioFore(
        "Drew signs a CLEAN list, Utah. Finish the punch.",
        "Drew signs a CLEAN list. Finish the punch, Tremont."
      );
    } else if (it.id === "signoffs") {
      toast("FINISH THE CHECKS FIRST", true);
      radioFore(
        "Nobody signs 'til the checks are done, y'all.",
        "Nobody signs until the checks are done."
      );
    }
    sfx("bad");
    return;
  }
  if (it.store) {
    openStore();
    sfx("pickup");
    vib(10);
    return;
  }
  if (it.andyFund) {
    // sick & needy fund: hall tradition — you give, the local has your back
    if (dayState.andyGave) {
      speakAs("andy", "Local takes care of its own. Sick and needy fund.");
      toast("YOU'RE PAID UP TODAY");
      sfx("ok");
      return;
    }
    if (state.watts < 100) {
      speakAs("andy", "Folding money. Not IOUs.");
      toast("NEED 100 PTS", true);
      sfx("bad");
      return;
    }
    state.watts -= 100;
    $("watts").textContent = state.watts.toLocaleString();
    $("watts-mini").textContent = "PTS " + state.watts.toLocaleString();
    dayState.andyGave = true;
    if (state.hp < 3) {
      state.hp += 1; // the fund takes care of you right back
      setHearts();
      toast("GAVE $5 · THE LOCAL'S GOT YOU");
    } else {
      state.combo += 1; // morale money
      toast("GAVE $5 · MORALE'S UP");
    }
    speakAs("andy", "Local takes care of its own. Sick and needy fund.");
    sfx("ok");
    vib(15);
    track("andy_fund", { day });
    if (REAL_FUND.url && !dayState.realFundHint) {
      dayState.realFundHint = true;
      setTimeout(() => toast("REAL FUND LINK'S ON THE BREAK SCREEN"), 2600);
    }
    return;
  }
  if (it.candy) {
    if (getTraveler() === "tremont") {
      toast("NOT MY CART");
      speakAs("tremont", "I don't run that bag. Protein and a Ford payment.");
      sfx("bad");
      return;
    }
    if (dayState.candyCd && performance.now() < dayState.candyCd) {
      toast("CREW'S STILL CHEWING");
      return;
    }
    dayState.candyCd = performance.now() + 30000;
    speakAs("utah", "Want any mood enhancing drugs?");
    const replies = [
      "They're Skittles, Utah. They're just Skittles.",
      "God bless the candy man.",
      "I'm on nights — gimme two handfuls.",
      "HR is a phone call away, Utah.",
      "Yeah, hit me. Doctor's orders.",
    ];
    setTimeout(() => speakAs("crew", replies[Math.floor(Math.random() * replies.length)]), 1900);
    // candy pays by the mouth: every hand within earshot is morale money
    const px = player.position.x;
    const pz = player.position.z;
    let near = state.crew.filter((c) => !c.lift && Math.hypot(px - c.mesh.position.x, pz - c.mesh.position.z) < 7).length;
    if (state.drew && Math.hypot(px - state.drew.mesh.position.x, pz - state.drew.mesh.position.z) < 7) near++;
    addWatts(40 + near * 60, near > 0 ? "CANDY RUN ×" + near : "MORALE");
    state.speedBoost = Math.max(state.speedBoost, 4);
    toast(near > 0 ? "CREW MOOD ENHANCED ×" + near : "MOOD ENHANCED");
    vib(15);
    sfx("pickup");
    track("egg_candy", { near });
    return; // the bag never runs out — it's a GIANT bag
  }
  if (it.cartGrab) {
    if (dayState.driving || dayState.utv) {
      toast(dayState.utv ? "PARK THE SXS FIRST" : "PARK THE SCISSOR FIRST", true);
      sfx("bad");
      return;
    }
    dayState.pushCart = !dayState.pushCart;
    toast(dayState.pushCart ? "CART'S ROLLING" : "CART PARKED");
    if (dayState.pushCart) {
      if (getTraveler() === "tremont") {
        speakAs("tremont", "Tool cart. Not a snack cart. Keep it rolling.");
      } else {
        speakAs("utah", "Cart's coming with me. Candy stays cold.");
      }
    }
    sfx("pickup");
    vib(10);
    return;
  }
  if (it.utv) {
    mountUtv(it.utvRef);
    return;
  }
  if (it.liftDrive) {
    if (dayState.utv) {
      toast("PARK THE SXS FIRST", true);
      return;
    }
    if (dayState.driving && dayState.liftH > 0.5) {
      toast("LOWER IT FIRST — TIE-OFF RULES", true);
      radioFore(
        "Ain't no ladder up there, y'all. Bring the deck down first.",
        "No ladder up there. Bring the deck down first."
      );
      sfx("bad");
      return;
    }
    if (!dayState.driving && dayState.carrying) {
      toast("NOT WITH A REEL ON", true);
      sfx("bad");
      return;
    }
    if (!dayState.driving && dayState.pushCart) {
      dayState.pushCart = false;
      toast("CART PARKED");
    }
    dayState.driving = !dayState.driving;
    syncLiftBtns();
    if (dayState.driving) {
      toast(isCoarse() ? "BLUE SCISSOR — ROLLING" : "SCISSOR — SPACE UP · C DOWN");
      speakAs(getTraveler() === "tremont" ? "tremont" : "utah",
          getTraveler() === "tremont" ? "Borrowing the blue scissor. Legs still warm from the set." : "Borrowing the blue scissor. Tell Ferguson it drives itself.");
      track("lift_drive", {});
    } else {
      toast("SCISSOR PARKED");
      const L = state.driveLift.mesh;
      let placed = false;
      for (const [ox, oz] of [[1.7, 0], [-1.7, 0], [0, 1.9], [0, -1.9], [2.4, 2.4]]) {
        if (!pointInCollider(L.position.x + ox, L.position.z + oz, 0.4)) {
          player.position.set(L.position.x + ox, 0, L.position.z + oz);
          placed = true;
          break;
        }
      }
      if (!placed) {
        // settle the last-resort spot against the colliders instead of
        // dropping the player inside a wall next to a parked lift
        const safe = collideXZ(L.position.x, L.position.z - 2.6, 0.4, 0);
        player.position.set(safe.x, 0, safe.z);
      }
    }
    sfx("pickup");
    vib(15);
    return;
  }
  if (it.coffee) {
    it.done = true;
    it.mesh.visible = false;
    state.hp = Math.min(3, state.hp + 1);
    state.speedBoost = 8;
    setHearts();
    addWatts(80, "COFFEE");
    if (getTraveler() === "tremont") {
      speakAs("tremont", "Black coffee. No sugar sludge.");
      toast("BLACK COFFEE");
    } else {
      radio((radioPack().coffee || RADIO.coffee)[0]);
    }
    sfx("ok");
    return;
  }
  if (it.tender) {
    it.done = true;
    it.mesh.visible = false;
    if (getTraveler() === "tremont") {
      // he leaves it — recovery food is after the whistle
      toast("PASSED ON THE TENDY");
      speakAs("tremont", "Tendies are a recovery meal. Not a mid-shift meal.");
      addWatts(40, "DISCIPLINE");
      track("egg_tendy_skip", {});
      sfx("pickup");
      return;
    }
    state.hp = Math.min(3, state.hp + 1);
    state.speedBoost = 6;
    setHearts();
    addWatts(150, "TENDY");
    toast("GAS STATION TENDY");
    radio("Wendel's finest tenders. Don't tell safety, Utah.");
    vib([15, 30, 15]);
    track("egg_tendy", {});
    sfx("ok");
    return;
  }
  if (it.high) {
    // scissor-only reach: on the deck, at height, or it doesn't count
    if (!dayState.driving || Math.abs(player.position.y - (it.y || 5.2)) > 2.1) {
      toast("IT'S UP HIGH — BRING THE BLUE SCISSOR", true);
      if (!dayState.highNudge) {
        dayState.highNudge = true;
        radioFore(
          "That one's up high, y'all. Blue scissor's parked in the yard.",
          "That one's up high. Blue scissor's parked in the yard. Bring it."
        );
      }
      sfx("bad");
      return;
    }
    if (it.mag) {
      openMag(it);
      return;
    }
    it.done = true;
    if (it.marker) it.marker.visible = false;
    if (it.smoke) setSmokeLook(it.smoke, true);
    sfx("strobe");
    completeTick("high", "HIGH WORK", 380);
    saveCheckpoint();
    return;
  }
  if (it.mag) {
    openMag(it);
    return;
  }
  if (it.trouble) {
    openTrouble(it);
    return;
  }
  if (it.eol || it.nacEol) {
    openPanel(it);
    return;
  }
  if (it.demo) {
    it.done = true;
    if (it.marker) {
      it.marker.visible = false;
      it.marker.material.color.setHex(0xff5a4a);
    }
    sfx("strobe");
    tone?.(660, 0.3, "square", 0.05);
    completeTick("demos", "DEMO'D CLEAN", 330);
    return;
  }
  if (it.battery) {
    it.done = true;
    if (it.marker) it.marker.visible = false;
    if (it.batteryStrobe) {
      setStrobeLook(it.batteryStrobe, true);
      if (it.batteryStrobe.lens) {
        it.batteryStrobe.lens.material.emissiveIntensity = 3;
        setTimeout(() => setStrobeLook(it.batteryStrobe, true), 1200);
      }
    }
    sfx("strobe");
    completeTick("batteries", isTremont() ? "EMERG OK" : "BATTERY OK", 320);
    return;
  }
  if (it.genny) {
    if (dayState.genTransferred) {
      toast("UTILITY'S BACK — GENNY'S OFF");
      sfx("ok");
      return;
    }
    // pay only when she actually drank — topping a full tank is not work
    const wasLow = (dayState.genT || 0) < GEN_FEED * 0.75;
    dayState.genT = GEN_FEED;
    dayState.genLow = false;
    dayState.genWarned = false;
    applyNightPower();
    if (wasLow) {
      addWatts(40, "GENNY FED");
      toast("DIESEL'S IN — HALLS UP");
    } else {
      toast("TANK'S STILL FULL");
    }
    sfx("ok");
    vib(15);
    return; // never done — she's thirsty until transfer
  }
  if (it.reelSrc) {
    if (dayState.driving) {
      toast("NOT FROM THE SCISSOR", true);
      sfx("bad");
      return;
    }
    if (dayState.carrying) {
      toast("ONE REEL AT A TIME", true);
      sfx("bad");
    } else if (state.progress.reels >= ((state.needs && state.needs.reels) || 4)) {
      // day 5 needs 3, day 12 needs 4 — a hard-coded 4 handed out an
      // un-stageable extra reel that stuck to the player all shift
      toast("RACK'S EMPTY");
    } else {
      dayState.carrying = true;
      if (state.carrySpool) state.carrySpool.visible = true;
      toast("REEL ON THE SHOULDER");
      sfx("pickup");
    }
    return;
  }
  if (it.reelTarget) {
    if (!dayState.carrying) {
      toast("NEED A REEL FROM THE RACK", true);
      sfx("bad");
      return;
    }
    dayState.carrying = false;
    if (state.carrySpool) state.carrySpool.visible = false;
    it.done = true;
    if (it.marker) it.marker.visible = false;
    placeSpoolAt(it.x, it.z);
    vib([15, 25, 15]);
    completeTick("reels", "REEL STAGED", 340);
    return;
  }
  if (it.pullGame) {
    openPull(it);
    return;
  }
  if (it.punch) {
    it.done = true;
    if (it.marker) it.marker.visible = false;
    vib(12);
    completeTick("punch", "PUNCHED", 300);
    return;
  }
  if (it.sign) {
    it.done = true;
    const who = it.sign;
    if (who === "lugo" || who === "lemon" || (who === "foreman")) {
      radio(getTraveler() === "tremont"
        ? "Signed. Don't make me regret trusting the form."
        : "Signed. Don't make me regret the penmanship.");
    }
    else if (who === "drew") {
      radio(drewLine("Signed. Clean work, Utah. Bills by 30."), "drew");
    } else if (who === "ahj") radio(isTremont() ? "Inspector signed the card. Don't touch anything else." : "AHJ signed the card. Don't touch anything else.");
    else radio("Drew signed it without looking up. That's as good as a handshake.");
    vib([20, 30, 20]);
    completeTick(it.id, "SIGNED", 420);
    return;
  }
  if (it.check) {
    it.done = true;
    if (it.marker) it.marker.visible = false;
    sfx("ok");
    completeTick("checks", "CHECKED", 320);
    return;
  }
  if (it.id === "tools") {
    it.done = true;
    it.mesh.visible = false;
    state.hasTools = true;
    if (cycleDay(day) === 4) applyNightPower();
    completeTick("tools", "POUCH ON", 120);
    if (cycleDay(day) === 1) radio(radioPack().tools[0]);
    else if (cycleDay(day) === 4) {
      radioFore(
        "Headlamp's on. Diesel's east of the south doors. Fuel her when she coughs — then batteries and ducts.",
        "Lamp's on. Diesel's east of the south doors. Fuel her when she coughs. Then emergency lights and sensors."
      );
    }
    return;
  }
  if (it.conduit) {
    it.conduit.visible = true;
    it.done = true;
    completeTick("conduit", "STICK", 150);
    return;
  }
  if (it.box) {
    it.box.visible = true;
    it.done = true;
    completeTick("boxes", "BOX UP", 160);
    return;
  }
  if (it.smoke) {
    setSmokeLook(it.smoke, true);
    it.done = true;
    completeTick("smokes", isTremont() ? "LIGHT UP" : "SMOKE UP", 170);
    return;
  }
  if (it.strobe) {
    setStrobeLook(it.strobe, true);
    it.done = true;
    completeTick("nac", isTremont() ? "DEVICE UP" : "STROBE UP", 180);
    return;
  }
  if (it.pull) {
    it.done = true;
    if (it.marker) it.marker.visible = false;
    completeTick("nac", isTremont() ? "SWITCH UP" : "PULL UP", 180);
    return;
  }
  if (it.vesda) {
    openPanel(it);
    return;
  }
  if (it.facp) {
    openFacp(it);
    return;
  }
}

function pickLine(arr) {
  if (!arr || !arr.length) return "";
  return arr[(Math.random() * arr.length) | 0];
}

function hurt(amount, why) {
  if (state.mode !== "play") return;
  const fork = why === "fork";
  state.hp -= amount;
  state.shocks += 1;
  state.combo = 0;
  setHearts();
  flash(fork ? "#ffd24a" : "#c8f6ff");
  sfx(fork ? "fork" : "zap");
  vib(80);
  shakeT = 0.4;
  toast(fork ? "FORKLIFT" : "ZAP", true);
  const pack = radioPack();
  radio(pickLine(fork ? pack.forklift : pack.shock));
  if (state.hp <= 0) {
    state.hp = 2;
    setHearts();
    dayState.driving = false;
    dayState.utv = null;
    dayState.workoutT = 0; // KO'd riders come off the lift — it stays where they left it
    dayState.pushCart = false;
    dayState.carrying = false; // the reel comes off the shoulder at the trailer too
    if (state.carrySpool) state.carrySpool.visible = false;
    syncLiftBtns();
    player.position.set(14, 0, 16);
    pvel.x = pvel.z = 0;
    kick.x = kick.z = 0;
    state.time = Math.max(0, state.time - 35);
    toast("TRAILER. SIT DOWN.", true);
    radioFore(
      "First aid. Then get back on the hall. I'm still writing your time.",
      "Sit down. Then get back on the iron. I'm still writing your time."
    );
  }
}

/* ------------------------------------------------------------------ */
/*  MINI GAMES                                                         */
/* ------------------------------------------------------------------ */
let panelTarget = null;
let wireSel = null;
let wireMap = [];
let links = [];

let panelPrint = "";
let panelReady = true;
let panelSpec = null;
let panelGates = { jumper: true, resistor: true };

function shuffleSeeded(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

function showPrint(url) {
  if (!url) return;
  $("print-img").src = url;
  $("print-view").classList.remove("hidden");
}
$("print-view-close").onclick = () => $("print-view").classList.add("hidden");
$("print-view").addEventListener("click", (e) => {
  if (e.target.id === "print-view") $("print-view").classList.add("hidden");
});

function panelKindSpec(it) {
  if (isTremont()) {
    const feeder = it.id === "term";
    const home = !!it.eol;
    return {
      title: feeder ? "LAND THE FEEDER" : home ? "LAND THE HOMERUN" : "LAND THE CIRCUIT",
      sub: feeder
        ? "Whole week comes down to four terminals. Land the feeder clean."
        : home
          ? "Old lug's cooked. Land the new one's legs clean — circuit stays honest."
          : "Tap a conductor, then its terminal. Land it clean.",
      print: "",
      colors: [
        { id: "SI+", name: "HOT IN", c: "#e23b2f", ink: "#111" },
        { id: "SI-", name: "NEUT IN", c: "#26282e", ink: "#eee" },
        { id: "SO+", name: "HOT OUT", c: "#ff8a3a", ink: "#111" },
        { id: "SO-", name: "NEUT OUT", c: "#f2f2f2", ink: "#111" },
      ],
      terms: { "SI+": "TB1  HOT IN", "SI-": "TB2  NEUT IN", "SO+": "TB3  HOT OUT", "SO-": "TB4  NEUT OUT" },
    };
  }
  if (it.id === "term") {
    return {
      title: "LAND THE SLC RISER",
      sub: "SLC 16/2 into the can. Red +, black −. Black tape on IN. Insulate the drain — do not land it on the can.",
      print: "/assets/prints_pull.jpg",
      colors: [
        { id: "SI+", name: "RED IN  +", c: "#e23b2f", ink: "#111" },
        { id: "SI-", name: "BLK IN  −", c: "#1a1c20", ink: "#eee" },
        { id: "SO+", name: "RED OUT +", c: "#c62828", ink: "#fff" },
        { id: "SO-", name: "BLK OUT −", c: "#f2f2f2", ink: "#111" },
        { id: "SH", name: "DRAIN", c: "#8a8a92", ink: "#111" },
      ],
      terms: {
        "SI+": "IN +   (TAPE)",
        "SI-": "IN −   (TAPE)",
        "SO+": "OUT +",
        "SO-": "OUT −",
        SH: "INSULATE — NO LAND",
      },
    };
  }
  if (it.eol) {
    return {
      title: "SWAP THE EOLR",
      sub: "XTRI supervised switch. EOLR is 4700Ω ¼W on terminals 4 and 5. Not the 470Ω NAC resistor. Not SLC 1-2.",
      print: "/assets/prints_xtri.jpg",
      resistor: "4.7k",
      colors: [
        { id: "E4", name: "4.7k  LEG A", c: "#c9a227", ink: "#111" },
        { id: "E5", name: "4.7k  LEG B", c: "#c9a227", ink: "#111" },
      ],
      terms: { E4: "4  SWITCH", E5: "5  SWITCH" },
      decoys: [
        { id: "D1", name: "1  SLC IN+" },
        { id: "D2", name: "2  SLC IN−" },
        { id: "D7", name: "7  COM" },
        { id: "D8", name: "8  N.O." },
      ],
    };
  }
  if (it.nacEol) {
    return {
      title: "LAND THE NAC EOL",
      sub: "Last appliance on the circuit. Lift the jumper tab. 470Ω from −6 to +b — not 4.7k.",
      print: "/assets/prints_nac_detail.jpg",
      jumper: true,
      resistor: "470",
      colors: [
        { id: "E6", name: "470Ω  LEG −6", c: "#c9a227", ink: "#111" },
        { id: "EB", name: "470Ω  LEG +b", c: "#c9a227", ink: "#111" },
      ],
      terms: { E6: "−6  BLK OUT", EB: "+b  IN/OUT" },
      decoys: [
        { id: "D5", name: "−5  BLK IN" },
        { id: "D4", name: "4  XTRI SWITCH" },
      ],
    };
  }
  if (it.strobe) {
    return {
      title: "LAND THE NAC",
      sub: "Notification circuit. Remove the metal jumper tab between −6 and −5 first. Red on +b (IN/OUT). Black IN on −5, black OUT on −6. Last device gets 470Ω from −6 to +b.",
      print: "/assets/prints_nac_detail.jpg",
      jumper: true,
      colors: [
        { id: "NP", name: "RED  +b", c: "#e23b2f", ink: "#111" },
        { id: "NI", name: "BLK IN  −5", c: "#1a1c20", ink: "#eee" },
        { id: "NO", name: "BLK OUT −6", c: "#f2f2f2", ink: "#111" },
      ],
      terms: { NP: "+b  IN/OUT", NI: "−5  BLK IN", NO: "−6  BLK OUT" },
    };
  }
  if (it.pull) {
    return {
      title: "LAND THE XMS PULL",
      sub: "SLC 16/2. Black tape on IN. Red +, black −, in and out. Insulate the drain. Test for grounds and shorts. Do not program the DPU with field wiring on.",
      print: "/assets/prints_pull.jpg",
      colors: [
        { id: "SI+", name: "RED IN  +", c: "#e23b2f", ink: "#111" },
        { id: "SI-", name: "BLK IN  −", c: "#1a1c20", ink: "#eee" },
        { id: "SO+", name: "RED OUT +", c: "#c62828", ink: "#fff" },
        { id: "SO-", name: "BLK OUT −", c: "#f2f2f2", ink: "#111" },
        { id: "SH", name: "DRAIN", c: "#8a8a92", ink: "#111" },
      ],
      terms: {
        "SI+": "IN +   (TAPE)",
        "SI-": "IN −   (TAPE)",
        "SO+": "OUT +",
        "SO-": "OUT −",
        SH: "INSULATE — NO LAND",
      },
    };
  }
  if (it.vesda) {
    const fault = it.vesdaKind === "fault";
    if (fault) {
      return {
        title: "LAND VESDA FAULT CONTACTS",
        sub: "Print: MINOR and URGENT FAULT contacts are POWER ON WHEN VESDA IS NORMAL. 470Ω EOL on those contacts. Do not kill 24V. Do not use 4.7k.",
        print: "/assets/prints_vesda.jpg",
        resistor: "470",
        vesda: true,
        confirm: { label: "FAULT CONTACTS STAY ON IN NORMAL — LEAVE 24V", toast: "DON'T KILL 24V" },
        colors: [
          { id: "MF", name: "MINOR FAULT", c: "#3aa0e8", ink: "#111" },
          { id: "UF", name: "URGENT FAULT", c: "#6a7cff", ink: "#fff" },
          { id: "EM", name: "470Ω MINOR", c: "#c9a227", ink: "#111" },
          { id: "EU", name: "470Ω URGENT", c: "#c9a227", ink: "#111" },
        ],
        terms: {
          MF: "MINOR F/G  (NORMAL=ON)",
          UF: "URGENT F/G  (NORMAL=ON)",
          EM: "MINOR  EOL 470Ω",
          EU: "URGENT  EOL 470Ω",
        },
        decoys: [
          { id: "D1", name: "FIRE 1  (ALARM=ON)" },
          { id: "D2", name: "FIRE 2  (ALARM=ON)" },
          { id: "D3", name: "XTRI 4–5  4.7k" },
        ],
      };
    }
    return {
      title: "LAND VESDA FIRE + 24V",
      sub: "Print: 24VDC in. FIRE 1 / FIRE 2 contacts are POWER ON WHEN VESDA IS IN ALARM. 470Ω EOL on the fire pair. Isolator stays in. Not 4.7k.",
      print: "/assets/prints_vesda.jpg",
      resistor: "470",
      vesda: true,
      confirm: { label: "FIRE CONTACTS: POWER ON IN ALARM", toast: "ALARM = ON, NORMAL = OFF" },
      colors: [
        { id: "V24", name: "24VDC +", c: "#e23b2f", ink: "#111" },
        { id: "V0", name: "24VDC −", c: "#1a1c20", ink: "#eee" },
        { id: "F1", name: "FIRE 1", c: "#ff8a3a", ink: "#111" },
        { id: "EF", name: "470Ω FIRE", c: "#c9a227", ink: "#111" },
      ],
      terms: {
        V24: "24VDC  +",
        V0: "24VDC  −",
        F1: "FIRE 1  (ALARM=ON)",
        EF: "FIRE 1  EOL 470Ω",
      },
      decoys: [
        { id: "D1", name: "MINOR FAULT  (NORMAL=ON)" },
        { id: "D2", name: "URGENT FAULT  (NORMAL=ON)" },
        { id: "D3", name: "XTRI 4–5  4.7k" },
      ],
    };
  }
  return {
    title: "LAND THE XTRI-R",
    sub: "Addressable SLC on 1–2 (red +, black −). 4.7kΩ ¼W EOLR on 4–5 for the supervised switch. Relay 7 COM / 8 N.O. goes to the unit — RTU or fire damper. XTRI-S is fan-mod only.",
    print: "/assets/prints_xtri.jpg",
    colors: [
      { id: "SI+", name: "SLC +  RED", c: "#e23b2f", ink: "#111" },
      { id: "SI-", name: "SLC −  BLK", c: "#1a1c20", ink: "#eee" },
      { id: "E4", name: "4.7k  TB4", c: "#c9a227", ink: "#111" },
      { id: "E5", name: "4.7k  TB5", c: "#c9a227", ink: "#111" },
    ],
    terms: { "SI+": "1  SLC IN+", "SI-": "2  SLC IN−", E4: "4  SWITCH", E5: "5  SWITCH" },
  };
}

/* ------------------------------------------------------------------ */
/*  VESDA — three taps. Power on B, 470Ω, leave the isolator.         */
/* ------------------------------------------------------------------ */
let vesStep = 0;
let vesBusy = false;

const VES_STEPS = [
  {
    tag: "POWER",
    ask: "24 volts in. Which port?",
    ok: { id: "B", lab: "B", sub: "24VDC IN", hit: "SHE'S GOT POWER", ok: true },
    no: { id: "A", lab: "A", sub: "POWER OUT", miss: "Wrong door. B is 24V IN." },
  },
  {
    tag: "EOL",
    ask: "Fault contacts stay ON when she's normal. Which resistor?",
    ok: { id: "470", lab: "470Ω", sub: "VESDA AUX", hit: "FAIL-SAFE. FAULTS STAY HOT.", ok: true },
    no: { id: "47k", lab: "4.7kΩ", sub: "XTRI SWITCH", miss: "That's the XTRI. Vesda wants 470." },
  },
  {
    tag: "ISOLATOR",
    ask: "Disable / Isolate. What's it doing?",
    ok: { id: "leave", lab: "LEAVE IT", sub: "STAYS IN", hit: "CLEAN LANDING", ok: true },
    no: { id: "pull", lab: "PULL IT", sub: "DISABLE", miss: "Isolator stays in." },
  },
];

function openVesdaBoard(it) {
  panelTarget = it;
  state.mode = "panel";
  vesStep = 0;
  vesBusy = false;
  $("title-screen")?.classList.add("hidden");
  $("panel-close").disabled = false;
  panelPrint = "/assets/prints_vesda.jpg";
  const sheet = document.querySelector("#panel-game .sheet");
  if (sheet) {
    sheet.classList.add("ves-play");
    sheet.classList.remove("ves-wide");
  }
  document.querySelector("#panel-game h2").textContent = "LAND THE VESDA";
  $("panel-sub").textContent = "Three taps. Don't overthink it.";
  $("panel-print-btn").classList.remove("hidden");
  $("panel-print-btn").onclick = () => showPrint(panelPrint);
  $("panel-steps").innerHTML = "";
  $("wire-board")?.classList.add("hidden");
  const board = $("ves-board");
  board.classList.remove("hidden", "ves-locked");
  renderVesStep();
  $("panel-game").classList.remove("hidden");
}

function renderVesStep() {
  const board = $("ves-board");
  const step = VES_STEPS[vesStep];
  const lit = vesStep;
  const seed = ((((state.seed || 1) + (panelTarget ? panelTarget.x * 9 + panelTarget.z : 3) + vesStep * 17) | 0) >>> 0);
  const rand = rng(seed);
  const order = rand() > 0.5 ? [step.ok, step.no] : [step.no, step.ok];
  board.innerHTML = `
    <div class="ves-playfield">
      <div class="ves-cab${lit > 0 ? " on" : ""}" id="ves-cab">
        <div class="ves-pipe"></div>
        <div class="ves-led" id="ves-led"></div>
        <p class="ves-cab-name">VESDA</p>
        <div class="ves-pips">${[0, 1, 2].map((i) => `<i class="${i < lit ? "done" : i === lit ? "now" : ""}"></i>`).join("")}</div>
        <div class="ves-ports">
          <span class="${vesStep === 0 ? "glow" : lit > 0 ? "ok" : ""}">B</span>
          <span class="${lit > 0 ? "dim" : ""}">A</span>
        </div>
      </div>
      <p class="ves-step-tag">STEP ${vesStep + 1} / 3 · ${step.tag}</p>
      <p class="ves-ask">${step.ask}</p>
      <div class="ves-picks" id="ves-picks"></div>
    </div>`;
  const picks = $("ves-picks");
  order.forEach((c) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ves-pick"; // never paint the answer key on at render time
    b.innerHTML = `<b>${c.lab}</b><span>${c.sub}</span>`;
    b.addEventListener("click", () => vesPick(c, b));
    picks.appendChild(b);
  });
}

function vesPick(choice, btn) {
  if (vesBusy) return;
  vesBusy = true;
  const cab = $("ves-cab");
  if (!choice.ok) {
    sfx("bad");
    flash("#ff6a1a");
    toast(choice.miss, true);
    btn.classList.add("miss");
    cab?.classList.add("shake");
    setTimeout(() => {
      btn.classList.remove("miss");
      cab?.classList.remove("shake");
      vesBusy = false;
    }, 420);
    return;
  }
  sfx("ok");
  btn.classList.add("hit");
  cab?.classList.add("on");
  toast(choice.hit);
  vesStep += 1;
  if (vesStep >= VES_STEPS.length) {
    $("panel-close").disabled = true;
    setTimeout(() => closePanel(true), 420);
    return;
  }
  setTimeout(() => {
    vesBusy = false;
    renderVesStep();
  }, 380);
}


function openPanel(it) {
  if (it && it.vesda) {
    openVesdaBoard(it);
    return;
  }
  $("ves-board")?.classList.add("hidden");
  $("wire-board")?.classList.remove("hidden");
  document.querySelector("#panel-game .sheet")?.classList.remove("ves-wide", "ves-play");
  panelTarget = it;
  state.mode = "panel";
  $("panel-close").disabled = false;
  const spec = panelKindSpec(it);
  panelSpec = spec;
  panelPrint = spec.print || "";
  document.querySelector("#panel-game h2").textContent = spec.title;
  $("panel-sub").textContent = spec.sub;
  $("panel-print-btn").classList.toggle("hidden", !panelPrint);
  $("panel-print-btn").onclick = () => showPrint(panelPrint);
  const steps = $("panel-steps");
  steps.innerHTML = "";
  panelGates = { jumper: !spec.jumper, resistor: !spec.resistor, confirm: !spec.confirm };
  const gatesOk = () => panelGates.jumper && panelGates.resistor && panelGates.confirm;
  panelReady = gatesOk();
  if (spec.jumper) {
    const jb = document.createElement("button");
    jb.type = "button";
    jb.className = "must-jumper";
    jb.textContent = "1. TAP HERE — REMOVE JUMPER TAB  −6 TO −5";
    jb.onclick = () => {
      if (jb.classList.contains("done")) return;
      jb.classList.add("done");
      jb.classList.remove("must-jumper");
      jb.textContent = "JUMPER LIFTED — LAND THE WIRES";
      panelGates.jumper = true;
      panelReady = gatesOk();
      $("wire-board")?.classList.remove("locked");
      sfx("pickup");
      toast("JUMPER OFF — NOW LAND THE WIRES");
    };
    steps.appendChild(jb);
    $("wire-board")?.classList.add("locked");
  } else {
    $("wire-board")?.classList.remove("locked");
  }
  if (spec.confirm) {
    const cb = document.createElement("button");
    cb.type = "button";
    cb.textContent = spec.confirm.label;
    cb.onclick = () => {
      if (cb.classList.contains("done")) return;
      cb.classList.add("done");
      panelGates.confirm = true;
      panelReady = gatesOk();
      sfx("pickup");
      toast(spec.confirm.toast || "PRINT CHECK");
    };
    steps.appendChild(cb);
  }
  if (spec.resistor) {
    const want = spec.resistor;
    [
      ["470", "470Ω  NAC / VESDA", want === "470"],
      ["4.7k", "4.7kΩ  XTRI ¼W", want === "4.7k"],
      ["10k", "10kΩ", false],
    ].forEach(([id, lab, ok]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "res-pick";
      b.textContent = lab;
      b.onclick = () => {
        if (panelGates.resistor) return;
        if (!ok) {
          sfx("bad");
          let msg = "NOT ON THE PRINT";
          if (want === "4.7k" && id === "470") msg = "470Ω IS NAC / VESDA. SUPERVISED SWITCH IS 4.7k ¼W";
          else if (want === "470" && id === "4.7k")
            msg = spec.vesda ? "4.7k IS THE XTRI SWITCH. VESDA AUX EOL IS 470Ω" : "4.7k IS THE XTRI SWITCH. NAC EOL IS 470Ω";
          toast(msg, true);
          b.classList.add("bad");
          return;
        }
        [...steps.querySelectorAll(".res-pick")].forEach((el) => el.classList.add("done"));
        panelGates.resistor = true;
        panelReady = gatesOk();
        sfx("ok");
        toast(want === "470" ? (spec.vesda ? "470Ω — VESDA AUX EOL" : "470Ω — THAT'S THE NAC EOL") : "4.7k — THAT'S THE EOLR");
      };
      steps.appendChild(b);
    });
  }
  const colors = spec.colors.slice();
  const termList = colors.map((c) => ({ id: c.id, label: spec.terms[c.id], c: c.c }));
  if (spec.decoys) {
    for (const d of spec.decoys) termList.push({ id: d.id, label: d.name, c: "#5a5a50", decoy: true });
  }
  const rand = rng((((state.seed || 1) + (it.x * 10 + it.z) * 13) | 0) >>> 0);
  const terms = shuffleSeeded(termList, rand);
  wireMap = colors;
  links = [];
  wireSel = null;
  const wbox = $("wires");
  const tbox = $("terms");
  wbox.innerHTML = "";
  tbox.innerHTML = "";
  $("wire-svg").innerHTML = "";
  const rows = Math.max(colors.length, terms.length);
  $("wire-svg").setAttribute("viewBox", `0 0 200 ${Math.max(240, rows * 52)}`);
  colors.forEach((c) => {
    const b = document.createElement("button");
    b.className = "wbtn";
    b.style.background = c.c;
    b.style.color = c.ink;
    b.textContent = c.name;
    b.dataset.id = c.id;
    b.addEventListener("click", () => {
      if (!panelReady) {
        sfx("bad");
        toast(!panelGates.jumper ? "JUMPER FIRST — LIFT −6 TO −5" : !panelGates.confirm ? "READ THE PRINT FIRST" : spec.resistor === "470" ? "PICK THE 470Ω FIRST" : "PICK THE 4.7k FIRST", true);
        return;
      }
      wireSel = c.id;
      [...wbox.children].forEach((el) => el.classList.toggle("sel", el.dataset.id === c.id));
    });
    wbox.appendChild(b);
  });
  terms.forEach((c, i) => {
    const b = document.createElement("button");
    b.className = "tbtn";
    b.style.background = "#2a2e22";
    b.style.color = c.c === "#1a1c20" || c.c === "#26282e" ? "#c9cdb8" : c.c;
    b.style.borderLeft = `8px solid ${c.c}`;
    b.textContent = c.label;
    b.dataset.id = c.id;
    b.dataset.slot = i;
    b.addEventListener("click", () => landWire(c.id, i, b, c.c, c.decoy));
    tbox.appendChild(b);
  });
  $("panel-game").classList.remove("hidden");
}

function landWire(id, slot, btn, color, decoy) {
  if (!panelReady) {
    sfx("bad");
    toast("NOT YET", true);
    return;
  }
  if (!wireSel) return;
  if (decoy || wireSel !== id) {
    sfx("bad");
    toast(decoy ? "WRONG TERMINAL — READ THE PRINT" : "WRONG LEG", true);
    flash("#ff6a1a");
    return;
  }
  if (links.find((l) => l.id === id)) return;
  links.push({ id, slot, color });
  btn.classList.add("done");
  sfx("ok");
  if (id === "SH") toast("DRAIN TAPED — OFF THE CAN");
  drawLinks();
  if (links.length === wireMap.length) {
    $("panel-close").disabled = true;
    setTimeout(() => {
      closePanel(true);
    }, 280);
  }
}

function drawLinks() {
  const svg = $("wire-svg");
  svg.innerHTML = "";
  const n = Math.max(wireMap.length, $("terms").children.length);
  const step = n > 4 ? 47 : 60;
  links.forEach((l) => {
    const y1 = 26 + wireMap.findIndex((w) => w.id === l.id) * step;
    const y2 = 26 + l.slot * step;
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", `M 8 ${y1} C 80 ${y1}, 120 ${y2}, 192 ${y2}`);
    p.setAttribute("stroke", l.color);
    p.setAttribute("stroke-width", "6");
    p.setAttribute("fill", "none");
    svg.appendChild(p);
  });
}

function closePanel(success) {
  $("panel-game").classList.add("hidden");
  $("ves-board")?.classList.add("hidden");
  $("wire-board")?.classList.remove("hidden");
  document.querySelector("#panel-game .sheet")?.classList.remove("ves-wide", "ves-play");
  vesStep = 0;
  vesBusy = false;
  if (!state.built) {
    state.mode = "title";
    document.body.classList.add("gate");
    $("title-screen")?.classList.remove("hidden");
    if (success) toast("THAT'S THE LANDING — RUN IT ON THE HALL");
    panelTarget = null;
    return;
  }
  state.mode = "play";
  if (success && panelTarget && !panelTarget.done) {
    panelTarget.done = true;
    if (panelTarget.marker) panelTarget.marker.visible = false;
    if (panelTarget.strobe) setStrobeLook(panelTarget.strobe, true);
    vib([20, 30, 20]);
    const lab = panelTarget.id === "term"
      ? (isTremont() ? "FEEDER LANDED" : "RISER LANDED")
      : panelTarget.nacEol
        ? (isTremont() ? "HOMERUN LANDED" : "470Ω LANDED")
        : panelTarget.eol
          ? (isTremont() ? "HOMERUN LANDED" : "EOL SWAPPED")
          : panelTarget.vesda
            ? "VESDA LANDED"
            : panelTarget.strobe
            ? "NAC LANDED"
            : panelTarget.pull
              ? "XMS LANDED"
              : "DEVICE LANDED";
    completeTick(panelTarget.id, lab, panelTarget.id === "nac" ? 280 : panelTarget.vesda ? 420 : 360);
    if (panelTarget.vesda) dressVesda(panelTarget, true);
    saveCheckpoint();
  }
  panelTarget = null;
}
$("panel-close").onclick = () => closePanel(false);


let facpItem = null;
let facpAddrAt = 0;
let facpKeyAt = 0;
let facpDone = false;
const FACP_ADDR = [
  { id: "01", lab: "01  XMS PULL" },
  { id: "02", lab: "02  XTRI-R" },
  { id: "03", lab: "03  SMOKE" },
  { id: "04", lab: "04  NAC STROBE" },
  { id: "05", lab: "05  VESDA AUX" },
];
const GEAR_ADDR = [
  { id: "01", lab: "01  LIGHT" },
  { id: "02", lab: "02  LIGHT" },
  { id: "03", lab: "03  SWITCH" },
  { id: "04", lab: "04  REC" },
  { id: "05", lab: "05  FEEDER" },
];
const facpKeys = () => {
  const d = cycleDay(day); // week 2 (days 8-14) mirrors week 1's panel content
  if (isTremont()) {
    return (
      { 2: ["WALK TEST", "RACK IN", "CLOSE"], 4: ["TRANSFER", "RACK IN", "CLOSE"], 7: ["ENERGIZE", "RACK IN", "CLOSE"] }[d] || [
        "CHECK",
        "CLOSE",
        "RACK IN",
      ]
    );
  }
  return (
    { 2: ["WALK TEST", "SILENCE", "RESET"], 4: ["TRANSFER", "SILENCE", "RESET"], 7: ["ENERGIZE", "SILENCE", "RESET"] }[d] || [
      "ACK",
      "SILENCE",
      "RESET",
    ]
  );
};

function setFacpStatus(text, ok) {
  const el = $("facp-status");
  el.textContent = text;
  el.className = "facp-status" + (ok ? " ok" : "");
}

function openFacp(it) {
  facpItem = it;
  state.mode = "facp";
  facpAddrAt = 0;
  facpKeyAt = 0;
  facpDone = false;
  const keyNames = facpKeys();
  const cd = cycleDay(day); // week-2 days show their week-1 counterpart's panel
  const addrBook = isTremont() ? GEAR_ADDR : FACP_ADDR;
  $("facp-title").textContent = isTremont()
    ? ({ 2: "WALK-TEST GEAR", 3: "FINAL ACCEPTANCE", 4: "POWER TRANSFER", 7: "ENERGIZE CB-4" }[cd] || "COMMISSION GEAR")
    : ({ 2: "WALK-TEST FACP", 3: "FINAL ACCEPTANCE", 4: "POWER TRANSFER", 7: "ENERGIZE CB-4" }[cd] || "COMMISSION FACP");
  const facpSubs = isTremont()
    ? {
        1: `Address the circuits in order. Then ${keyNames.join(", ")}. Inspector is in the lot.`,
        2: `Walk-test. Address, then ${keyNames.join(", ")}. Inspector walks tomorrow.`,
        3: `He's on site. Address, then ${keyNames.join(", ")}. Don't make him write.`,
        4: `Utility's locked out. Address, then ${keyNames.join(", ")} to hand the building back.`,
        7: `Address the circuits in order. Then ${keyNames.join(", ")}. Inspector is at the gear.`,
      }
    : {
        1: `Address the loop in order. Then ${keyNames.join(", ")}. AHJ is in the lot.`,
        2: `Walk-test. Address, then ${keyNames.join(", ")}. AHJ walks tomorrow.`,
        3: `He's on site. Address, then ${keyNames.join(", ")}. Don't make him write.`,
        4: `Utility's locked out. Address, then ${keyNames.join(", ")} to hand the building back.`,
        7: `Address the loop in order. Then ${keyNames.join(", ")}. AHJ is at the panel.`,
      };
  $("facp-sub").textContent = facpSubs[cd] || facpSubs[1];
  $("facp-close").disabled = false;
  $("facp-game").classList.remove("hidden");
  setFacpStatus(isTremont() ? "TROUBLE  ·  CIRCUIT OPEN" : "TROUBLE  ·  LOOP OPEN");
  const loop = $("facp-loop");
  loop.innerHTML = "";
  const order = addrBook.map((a, i) => ({ ...a, i })).sort(() => Math.random() - 0.5);
  order.forEach((a) => {
    const b = document.createElement("button");
    b.className = "fa-chip";
    b.textContent = a.lab;
    b.onclick = () => hitAddr(a.i, b);
    loop.appendChild(b);
  });
  const keys = $("facp-keys");
  keys.innerHTML = "";
  // late in the week the panel keys aren't laid out for you anymore
  let keyDefs = facpKeys().map((k, i) => ({ k, i }));
  if (day >= 4) keyDefs = keyDefs.sort(() => Math.random() - 0.5);
  keyDefs.forEach(({ k, i }) => {
    const b = document.createElement("button");
    b.className = "fa-key";
    b.textContent = k;
    b.onclick = () => hitFacpKey(i, b);
    keys.appendChild(b);
  });
}

function hitAddr(i, btn) {
  if (facpDone) return;
  if (facpAddrAt >= FACP_ADDR.length) return;
  if (i !== facpAddrAt) {
    sfx("bad");
    toast("WRONG ADDRESS", true);
    facpAddrAt = 0;
    [...$("facp-loop").children].forEach((el) => el.classList.remove("on"));
    setFacpStatus("TROUBLE  ·  WRONG ADDRESS");
    return;
  }
  btn.classList.add("on");
  sfx("ok");
  facpAddrAt++;
  setFacpStatus(facpAddrAt >= FACP_ADDR.length ? "ADDRESSED  ·  " + facpKeys().join(" / ") : `ADDRESS ${FACP_ADDR[facpAddrAt - 1].id}  ·  NORMAL`);
}

function hitFacpKey(i, btn) {
  if (facpDone) return;
  if (facpAddrAt < FACP_ADDR.length) {
    sfx("bad");
    toast(isTremont() ? "ADDRESS THE PANEL" : "ADDRESS THE LOOP", true);
    return;
  }
  if (i !== facpKeyAt) {
    sfx("bad");
    facpKeyAt = 0;
    [...$("facp-keys").children].forEach((el) => el.classList.remove("on"));
    setFacpStatus("TROUBLE  ·  WRONG KEY");
    return;
  }
  btn.classList.add("on");
  sfx("ok");
  facpKeyAt++;
  if (facpKeyAt >= facpKeys().length) {
    facpDone = true; // commit window — no more taps count
    setFacpStatus("SYSTEM NORMAL", true);
    sfx(isTremont() ? "ok" : "horn");
    vib([60, 50, 60, 50, 140]);
    $("facp-close").disabled = true; // panel is normal — completion is committed
    setTimeout(() => {
      $("facp-game").classList.add("hidden");
      state.mode = "play";
      if (!isTremont()) {
        state.faLive = true;
        state.faHorns = 4;
      }
      if (facpItem) {
        facpItem.done = true;
        if (facpItem.marker) facpItem.marker.visible = false;
      }
      completeTick("facp", "SYSTEM NORMAL", 600);
      flash(isTremont() ? "#3cff6a" : "#ff3b2f");
    }, 420);
  }
}
$("facp-close").onclick = () => {
  $("facp-game").classList.add("hidden");
  state.mode = "play";
};

/* ------------------------------------------------------------------ */
/*  MAG TEST (day 2) — tap the needle through the green                */
/* ------------------------------------------------------------------ */
let magItem = null;
const mag = { t: 0, speed: 1.1, z0: 0, z1: 0 };

function openMag(it) {
  magItem = it;
  state.mode = "mag";
  const duct = it.id === "ducts" || !!it.duct;
  document.querySelector("#mag-game h2").textContent = duct ? (isTremont() ? "SENSOR RESET" : "DUCT RESET") : (isTremont() ? "MEG TEST" : "MAG TEST");
  document.querySelector("#mag-game .sheet p").textContent = duct
    ? (isTremont()
        ? "Occupancy sensor dumped on the transfer. Tap RESET when the needle sweeps the green."
        : "Duct detector tripped on the transfer. Tap RESET when the needle sweeps the green.")
    : (isTremont()
        ? "Megger's on the feeder. Tap TEST when the needle sweeps through the green."
        : "Magnet's on the smoke. Tap TEST when the needle sweeps through the green.");
  $("mag-tap").textContent = duct ? "RESET" : "TEST";
  mag.t = Math.random() * 2;
  mag.speed = 1.05 + Math.max(0, cycleDay(day) - 2) * 0.22 + Math.max(0, weekOfDay(day) - 1) * 0.15;
  const w = Math.max(8, 13 + Math.random() * 7 - Math.max(0, cycleDay(day) - 2) * 2);
  mag.z0 = 22 + Math.random() * (74 - w - 22);
  mag.z1 = mag.z0 + w;
  const zone = $("mag-zone");
  zone.style.left = mag.z0 + "%";
  zone.style.width = mag.z1 - mag.z0 + "%";
  $("mag-game").classList.remove("hidden");
}

function magPos() {
  const t = mag.t % 2;
  return (t < 1 ? t : 2 - t) * 100;
}

function updateMag(dt) {
  mag.t += dt * mag.speed;
  const p = magPos();
  // subtract the needle's own width so it never clips at the right edge
  $("mag-needle").style.left = `calc(${p}% - ${((p / 100) * 4).toFixed(1)}px)`;
}

$("mag-tap").addEventListener("click", () => {
  if (state.mode !== "mag") return;
  const p = magPos();
  if (p >= mag.z0 && p <= mag.z1) {
    sfx("ok");
    vib([15, 25, 15]);
    $("mag-game").classList.add("hidden");
    state.mode = "play";
    if (magItem && !magItem.done) {
      magItem.done = true;
      if (magItem.marker) magItem.marker.visible = false;
      // the meter serves two jobs: day-2 smoke tests and day-4 duct resets
      const asDuct = magItem.id === "ducts" || !!magItem.duct;
      completeTick(magItem.id, asDuct ? (isTremont() ? "SENSOR RESET" : "DUCT RESET") : (isTremont() ? "MEG OK" : "SENSITIVITY OK"), asDuct ? 340 : 320);
      saveCheckpoint();
    }
    magItem = null;
  } else {
    sfx("bad");
    toast(p < mag.z0 ? "EARLY" : "LATE", true);
    mag.speed = Math.min(2.4, mag.speed + 0.18); // misses make it twitchier
  }
});
$("mag-close").addEventListener("click", () => {
  $("mag-game").classList.add("hidden");
  state.mode = "play";
  magItem = null;
});

/* ------------------------------------------------------------------ */
/*  CHASE THE TROUBLE (day 2) — print-based diagnosis, not a guess */
/* ------------------------------------------------------------------ */
let troubleItem = null;
let troubleSpec = null;

const FA_TROUBLES = [
  {
    status: "TROUBLE  ·  GROUND FAULT  ·  SLC LOOP 1",
    see: "XMS pull can is open. Bare drain is under the ground screw. IN pair has no tape.",
    note: "Print: INSULATE SHIELD (DRAIN) WIRE WITH TUBING OR ELECTRICAL TAPE. Black tape on IN.",
    print: "/assets/prints_pull.jpg",
    printName: "VIEW XMS PULL PRINT",
    choices: [
      { t: "Insulate the drain — tape it off the can", ok: true },
      { t: "Land 4.7kΩ across SLC terminals 1 and 2", bad: "That's the loop, not the drain. Ground fault is the shield on the can." },
      { t: "Remove the metal jumper on the horn-strobe", bad: "Wrong circuit. Jumper is NAC, this trouble is SLC." },
      { t: "Flip SW4 on the candela dips", bad: "DIP switches don't clear a ground fault." },
    ],
  },
  {
    status: "TROUBLE  ·  SHORT  ·  NAC 1",
    see: "Horn-strobe backbox. Metal jumper tab is still bridging −6 and −5.",
    note: "Print: REMOVE METAL JUMPER TAB. Screw terminals: BLK OUT −6, BLK IN −5, RED +b IN/OUT.",
    print: "/assets/prints_nac_detail.jpg",
    printName: "VIEW NAC PRINT",
    choices: [
      { t: "Remove the jumper tab between −6 and −5", ok: true },
      { t: "Land 4.7kΩ on XTRI 4 and 5", bad: "That's the module switch EOL, not a NAC short." },
      { t: "Insulate the SLC drain", bad: "Drain is an SLC ground, this is a NAC short." },
      { t: "Put SW4 ON with the rest", bad: "Print says SW4 stays OFF. That's candela, not the short." },
    ],
  },
  {
    status: "TROUBLE  ·  OPEN  ·  XTRI SUPERVISED SWITCH",
    see: "XTRI-R on a damper point. 470Ω sitting on terminals 4 and 5.",
    note: "Print: EOLR (4700Ω ¼W) on terminals 4 and 5 for the supervised switch. Not 470Ω. Not SLC 1-2.",
    print: "/assets/prints_xtri.jpg",
    printName: "VIEW XTRI PRINT",
    choices: [
      { t: "Land 4.7kΩ ¼W on terminals 4 and 5", ok: true },
      { t: "Leave the 470Ω on 4 and 5", bad: "470Ω is NAC / Vesda. Supervised switch on the XTRI is 4.7k." },
      { t: "Land 4.7kΩ on SLC 1 and 2", bad: "1-2 is the addressable loop. EOLR for the switch is 4-5." },
      { t: "Swap the head to an XTRI-S", bad: "XTRI-S is fan-mod only. This point wants an XTRI-R and a 4.7k." },
    ],
  },
  {
    status: "TROUBLE  ·  OPEN  ·  NAC 1",
    see: "Last horn-strobe on the circuit. −6 and +b are empty. No resistor in the can.",
    note: "Print: (1) TO NEXT APPLIANCE OR EOL. Last device: 470Ω between −6 and +b. Not 4.7k.",
    print: "/assets/prints_nac_detail.jpg",
    printName: "VIEW NAC PRINT",
    choices: [
      { t: "Land 470Ω from −6 to +b on the last strobe", ok: true },
      { t: "Land 4.7kΩ from −6 to +b", bad: "NAC EOL is 470Ω. 4.7k is the XTRI switch." },
      { t: "Jump −6 to −5", bad: "That's the tab you're supposed to REMOVE. It shorts the circuit." },
      { t: "Tape the drain on the SLC", bad: "Wrong pair. This open is the notification circuit." },
    ],
  },
  {
    status: "TROUBLE  ·  WRONG CANDELA  ·  NAC DEVICE",
    see: "DIP bank on the horn-strobe. All five switches are ON.",
    note: "Print: DOUBLE CHECK DIP SWITCHES. SW1–SW3 ON, SW4 OFF, SW5 ON.",
    print: "/assets/prints_nac_detail.jpg",
    printName: "VIEW NAC PRINT",
    choices: [
      { t: "SW1–3 ON, SW4 OFF, SW5 ON", ok: true },
      { t: "Leave all five dips ON", bad: "Print has SW4 off. All-on is the wrong candela." },
      { t: "All five dips OFF", bad: "That's a dead device, not the shop setting." },
      { t: "SW4 ON, the rest OFF", bad: "Opposite of the print." },
    ],
  },
  {
    status: "TROUBLE  ·  WRONG MODULE  ·  DAMPER POINT",
    see: "Cover says XTRI-S. It's hanging on a fire damper, not a fan.",
    note: "Print: XTRI-S is FAN-MOD ONLY (crossed). XTRI-R relay: N.O. 8, COM 7 — wire to unit (RTU, fire damper).",
    print: "/assets/prints_xtri.jpg",
    printName: "VIEW XTRI PRINT",
    choices: [
      { t: "Swap to XTRI-R. COM 7 / N.O. 8 to the damper", ok: true },
      { t: "Keep the XTRI-S and land 4.7k on 6-7", bad: "S-head is fan-mod only. Damper wants an R-head and the relay." },
      { t: "Remove the NAC jumper", bad: "Wrong print. This point is a monitor/relay, not a strobe." },
      { t: "Program it with the field wiring on", bad: "DPU print says lift the field wiring first — and this is the wrong module anyway." },
    ],
  },
  {
    status: "TROUBLE  ·  OPEN  ·  SLC IN",
    see: "XMS pull. OUT is landed. IN terminals are empty. Loop dies past this device.",
    note: "Print: FROM PREVIOUS DEVICE, red +, black −, BLACK TAPE ON IN. Addressable SLC to the next device on OUT.",
    print: "/assets/prints_pull.jpg",
    printName: "VIEW XMS PULL PRINT",
    choices: [
      { t: "Land SLC IN — red on +, black on −, tape the IN", ok: true },
      { t: "Land OUT on the IN terminals", bad: "You just opened the rest of the loop. IN is from the previous device." },
      { t: "Put 4.7kΩ on the IN pair", bad: "That's a switch EOL, not an SLC landing." },
      { t: "Remove the metal jumper", bad: "Jumper is on the horn-strobe, not the pull." },
    ],
  },
  {
    status: "DPU FAULT  ·  CAN'T PROGRAM PULL",
    see: "DPU's hooked up. SLC in and out still on the XMS. It won't take an address.",
    note: "Print: CAUTION — DO NOT PROGRAM UNTIL ALL FIELD WIRING IS REMOVED. Then ADDRESS → PROGRAM → EXIT.",
    print: "/assets/prints_pull.jpg",
    printName: "VIEW XMS PULL PRINT",
    choices: [
      { t: "Lift the field wiring, then ADDRESS → PROGRAM → EXIT", ok: true },
      { t: "Program it hot with the SLC still landed", bad: "Print says that kills the DPU. Lift the field first." },
      { t: "Swap in a 470Ω and try again", bad: "Wrong part and the wiring is still on." },
      { t: "Flip SW4 and hit PROGRAM", bad: "No dips on an XMS. Lift the field, then the DPU." },
    ],
  },
  {
    status: "TROUBLE  ·  VESDA MINOR FAULT  ·  UNIT LOOKS NORMAL",
    see: "Vesda display is normal. F/G fault contacts are energized. Someone wants them killed.",
    note: "Print: MINOR AND URGENT FAULT CONTACTS ARE POWER ON WHEN VESDA IS NORMAL. 470Ω EOL on those contacts.",
    print: "/assets/prints_vesda.jpg",
    printName: "VIEW VESDA PRINT",
    choices: [
      { t: "Leave it — F/G are energized in normal. Check 470Ω EOL on the fault contacts", ok: true },
      { t: "Kill 24VDC to the Vesda to 'clear' the fault", bad: "That makes a real trouble. Those contacts are supposed to be on." },
      { t: "Land 4.7kΩ on the Vesda 24V in", bad: "Vesda EOL is 470Ω on the relay contacts, not 4.7k on power." },
      { t: "Swap the XTRI-S onto the Vesda loop", bad: "Vesda is its own panel. Don't hang a fan-mod on it." },
    ],
  },
  {
    status: "ALARM  ·  VESDA FIRE 1  ·  UNIT IS NORMAL",
    see: "FIRE 1 contacts are closed. Display says NORMAL. Someone landed them like the fault pair.",
    note: "Print: FIRE 1 AND FIRE 2 ARE POWER ON WHEN VESDA IS IN ALARM. Fault contacts are the opposite — on when NORMAL. 470Ω EOL.",
    print: "/assets/prints_vesda.jpg",
    printName: "VIEW VESDA PRINT",
    choices: [
      { t: "Rewire FIRE 1 as alarm=ON. Leave F/G energized in normal", ok: true },
      { t: "Kill 24VDC so FIRE 1 drops out", bad: "That just shuts the unit off. Fire contacts should be off in normal." },
      { t: "Land 4.7kΩ on FIRE 1", bad: "Vesda aux EOL is 470Ω, and the polarity is still wrong." },
      { t: "Swap in an XTRI-S on the aux", bad: "Vesda is its own panel. Don't hang a fan-mod on it." },
    ],
  },
];

const PWR_TROUBLES = [
  {
    status: "TROUBLE  ·  OPEN HOT",
    note: "Homerun's dead. Meter shows 0 on the hot lug, neutral is honest.",
    print: "",
    choices: [
      { t: "Land the hot on the lug and torque it", ok: true },
      { t: "Swap hot and neutral", bad: "Neutral's already honest. It's the hot that's open." },
      { t: "Add a 4.7k across the circuit", bad: "That's fire-alarm. You're on power." },
      { t: "Flip the lighting dip SW4", bad: "No dips on a feeder." },
    ],
  },
  {
    status: "TROUBLE  ·  REVERSED POLARITY",
    note: "Hot and neutral swapped at the rec. Bootleg looks live, device is angry.",
    print: "",
    choices: [
      { t: "Swap hot and neutral at the rec", ok: true },
      { t: "Land a jumper from −6 to −5", bad: "That's a NAC tab. Wrong trade." },
      { t: "Tape the drain and call it done", bad: "There's no drain on this homerun." },
      { t: "Put 470Ω across hot and neutral", bad: "That's an EOL, not a polarity fix." },
    ],
  },
  {
    status: "TROUBLE  ·  MISSING GROUND",
    note: "Can's floating. Equipment ground never landed.",
    print: "",
    choices: [
      { t: "Land the equipment ground", ok: true },
      { t: "Bond neutral to the can", bad: "That's a bootleg ground. Land the EG." },
      { t: "Insulate the drain with tape", bad: "Power circuit. You need a ground, not a taped shield." },
      { t: "Swap the breaker for a 15A", bad: "Doesn't put a ground on the can." },
    ],
  },
  {
    status: "TROUBLE  ·  LOOSE FEEDER LUG",
    note: "Homerun's cooked at the gear. Lug wasn't torqued.",
    print: "",
    choices: [
      { t: "Re-land and torque the feeder lug", ok: true },
      { t: "Add 4.7k across the lugs", bad: "That's an XTRI EOL. Torque the lug." },
      { t: "Remove the metal jumper", bad: "No jumper on gear lugs." },
      { t: "Program it with the DPU", bad: "This isn't addressable. It's a loose lug." },
    ],
  },
  {
    status: "TROUBLE  ·  WRONG BREAKER",
    note: "20A sitting on a 30A homerun. That's not the print.",
    print: "",
    choices: [
      { t: "Swap to the 30A the homerun is pulled for", ok: true },
      { t: "Leave the 20A and land 470Ω", bad: "Resistor doesn't change breaker size." },
      { t: "Tape the drain", bad: "Wrong trade and wrong fix." },
      { t: "Flip SW4 off", bad: "No dips in a panelboard." },
    ],
  },
  {
    status: "TROUBLE  ·  SHARED NEUTRAL",
    note: "Two hots, one neutral. Lights flicker when the other circuit loads.",
    print: "",
    choices: [
      { t: "Pull the neutrals apart — one per circuit", ok: true },
      { t: "Land both hots on one breaker", bad: "That's worse. Separate the neutrals." },
      { t: "Put 4.7k on the shared white", bad: "Not a fire-alarm switch pair." },
      { t: "Remove the NAC jumper", bad: "You're in a lighting can, not a strobe." },
    ],
  },
];

function openTrouble(it) {
  troubleItem = it;
  state.mode = "trouble";
  $("trouble-close").disabled = false;
  const pack = isTremont() ? PWR_TROUBLES : FA_TROUBLES;
  const rand = rng((((state.seed || 1) + state.progress.troubles * 7919) | 0) >>> 0);
  const spec = it && it.forceSpec != null ? pack[it.forceSpec % pack.length] : pack[Math.floor(rand() * pack.length)];
  troubleSpec = spec;
  const choices = shuffleSeeded(spec.choices, rand);
  $("trouble-title").textContent = isTremont() ? "CHASE THE OPEN" : "CHASE THE TROUBLE";
  $("trouble-status").textContent = spec.status;
  $("trouble-see").textContent = spec.see || spec.note;
  $("trouble-sub").textContent = spec.note || "";
  $("trouble-sub").classList.add("hidden");
  $("trouble-print-btn").classList.toggle("hidden", !spec.print);
  $("trouble-print-btn").textContent = spec.printName || "VIEW THE PRINT";
  if (!spec.print && spec.note) $("trouble-sub").classList.remove("hidden");
  $("trouble-print-btn").onclick = () => {
    showPrint(spec.print);
    if (spec.note) $("trouble-sub").classList.remove("hidden");
  };
  const rows = $("trouble-rows");
  rows.innerHTML = "";
  let locked = false;
  choices.forEach((ch) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tr-choice";
    b.textContent = ch.t;
    b.addEventListener("click", () => {
      if (locked) return;
      if (ch.ok) {
        locked = true;
        b.classList.add("ok");
        $("trouble-close").disabled = true;
        sfx("ok");
        vib([20, 30, 20]);
        toast(isTremont() ? "THAT'S THE FIX" : "THAT'S THE PRINT");
        setTimeout(() => {
          $("trouble-game").classList.add("hidden");
          $("print-view").classList.add("hidden");
          state.mode = "play";
          if (troubleItem && !troubleItem.done) {
            troubleItem.done = true;
            if (troubleItem.marker) troubleItem.marker.visible = false;
            completeTick("troubles", isTremont() ? "OPEN CLEARED" : "TROUBLE CLEARED", 380);
            saveCheckpoint();
          }
          troubleItem = null;
          troubleSpec = null;
        }, 420);
      } else {
        sfx("bad");
        b.classList.add("no");
        toast(ch.bad || "NOT THAT", true);
      }
    });
    rows.appendChild(b);
  });
  $("trouble-game").classList.remove("hidden");
}
$("trouble-close").addEventListener("click", () => {
  $("trouble-game").classList.add("hidden");
  $("print-view").classList.add("hidden");
  state.mode = "play";
  troubleItem = null;
  troubleSpec = null;
});

/*  PULL THE RISER (day 5) — hold to pull, respect the tension         */
/* ------------------------------------------------------------------ */
let pullItem = null;
const pull = { prog: 0, tension: 0, holding: false, t: 0 };

function openPull(it) {
  pullItem = it;
  state.mode = "pull";
  pull.prog = 0;
  pull.tension = 0;
  pull.holding = false;
  pull.t = Math.random() * 5;
  $("pull-close").disabled = false;
  $("pull-game").classList.remove("hidden");
}

function updatePull(dt) {
  pull.t += dt;
  if (pull.holding) {
    // friction comes in waves — you feel for the easy stretches
    pull.tension += dt * (0.5 + 0.38 * Math.sin(pull.t * 2.1) + 0.1 * Math.sin(pull.t * 5.7));
    if (pull.tension < 0.85) pull.prog += dt * 0.17;
    if (pull.tension >= 1) {
      pull.tension = 0.3;
      pull.prog = Math.max(0, pull.prog - 0.15);
      sfx("bad");
      vib(60);
      toast("NEAR BREAK — LET OFF", true);
    }
  } else {
    pull.tension = Math.max(0, pull.tension - dt * 0.95);
  }
  $("pull-prog").style.width = Math.min(100, pull.prog * 100) + "%";
  $("pull-pct").textContent = Math.round(Math.min(100, pull.prog * 100)) + "%";
  $("pull-tension").style.width = Math.min(100, pull.tension * 100) + "%";
  if (pull.prog >= 1) {
    $("pull-close").disabled = true;
    pull.prog = 1;
    state.mode = "play";
    $("pull-game").classList.add("hidden");
    if (pullItem && !pullItem.done) {
      pullItem.done = true;
      if (pullItem.marker) pullItem.marker.visible = false;
      sfx("ok");
      vib([20, 40, 20]);
      completeTick(pullItem.id, "SECTION PULLED", 380);
      saveCheckpoint();
    }
    pullItem = null;
  }
}

for (const [ev, v] of [["pointerdown", true], ["pointerup", false], ["pointercancel", false], ["pointerleave", false]]) {
  $("pull-hold").addEventListener(ev, (e) => {
    e.preventDefault();
    if (state.mode === "pull") pull.holding = v;
  });
}
$("pull-close").addEventListener("click", () => {
  $("pull-game").classList.add("hidden");
  state.mode = "play";
  pullItem = null;
});

/* ------------------------------------------------------------------ */
/*  WIN / LOSE                                                         */
/* ------------------------------------------------------------------ */
function rankName() {
  if (state.overtime > 0) return "APPRENTICE";
  if (state.time > shiftLen * 0.5) return "TOP HAND";
  if (state.time > shiftLen * 0.25) return "LEADMAN";
  return "JOURNEYMAN";
}

function win() {
  state.mode = "end";
  $("punch-hint").classList.add("hidden");
  sfx("win");
  flash("#d6f04a");
  // Board ranks WORK PTS so walking the site still pays. On-time pay
  // goes to the gang box — leftover seconds don't buy the leaderboard.
  const clockBonus =
    state.time > 0 ? 1600 + Math.round(state.time * 4 * (600 / shiftLen)) : 0;
  const workPts = state.watts;
  const seconds = Math.round(Math.max(0, shiftLen - state.time + state.overtime));
  // Snapshot NOW — tapping NEXT DAY used to zero watts / bump `day` before the post.
  lastWinRec = {
    name: commitHand(false) || "",
    local: readGateLocal(),
    pts: ptsNum(workPts),
    seconds,
    rank: rankName(),
    day,
    level: day,
    who: getTraveler(),
  };
  $("end-bonus").textContent =
    clockBonus > 0
      ? `WORK ${workPts.toLocaleString()} PTS · ON TIME +${clockBonus.toLocaleString()} TO THE GANG BOX`
      : `WORK ${workPts.toLocaleString()} PTS · OT · NO TIME PAY`;
  state.racks.forEach((led, i) => {
    setTimeout(() => {
      if (state.mode !== "end") return; // a quick RUN IT BACK cancels the show
      led.material.emissive = new THREE.Color(0x3dff6a);
      led.material.emissiveIntensity = 1.4;
    }, i * 80);
  });
  state.faLive = !isTremont();
  state.faHorns = isTremont() ? 0 : 3;
  sfx(isTremont() ? "ok" : "horn");
  vib([40, 60, 40, 60, 160]);
  track("shift_win", {
    rank: rankName(),
    pts: workPts,
    seconds,
    shocks: state.shocks,
    day,
    who: getTraveler(),
  });
  clearCheckpoint();
  $("end-eye").textContent = `DAY ${day} — ${dayDisplayName(day)} · ${travelerTag(getTraveler())} · O'CONNELL · BARKER, NY`;
  $("end-title").textContent = "SYSTEM NORMAL";
  $("end-rank").textContent = rankName();
  $("end-watts").textContent = workPts.toLocaleString();
  $("end-time").textContent = formatTime(seconds);
  $("end-shocks").textContent = state.shocks;
  addWallet(workPts + clockBonus);
  const best = loadBest();
  const el = $("end-best");
  if (!best || workPts > best.watts || (workPts === best.watts && seconds < (best.seconds || 1e9))) {
    saveBest({ watts: workPts, rank: rankName(), time: formatTime(seconds), seconds, who: getTraveler() });
    el.innerHTML = `<strong>NEW ${travelerTag(getTraveler())} · DAY ${day} RECORD</strong>`;
  } else {
    el.innerHTML = `${travelerTag(getTraveler())} · DAY ${day} RECORD: <strong>${best.watts.toLocaleString()} PTS${best.time ? " · " + best.time : ""} · ${best.rank}</strong>`;
  }
  unlockDay(day + 1);
  const nd = $("btn-next-day");
  nd.classList.toggle("hidden", day >= LAST_DAY);
  if (day < LAST_DAY) nd.textContent = `DAY ${day + 1} · ${dayDisplayName(day + 1)}`;
  if (day === LAST_DAY) {
    $("end-eye").textContent = "TOPPING OUT · LAKE MARINER";
    $("end-title").textContent = "CONTRACT COMPLETE";
    const burstColors = [0xd6f04a, 0xff8a3a, 0xffffff, 0x4a9eff, 0xff5a4a];
    for (let i = 0; i < 6; i++) {
      setTimeout(() => {
        if (state.mode !== "end") return;
        spawnBurst(CB.corX - 12 + Math.random() * 36, 13 + Math.random() * 6, 80 + Math.random() * 60, burstColors[i % burstColors.length]);
        sfx("strobe");
      }, 500 + i * 700);
    }
  }
  // auto-post this win — don't make them tap POST IT after a landed loop
  scorePosted = false;
  $("board-mini").textContent = "";
  $("post-score").classList.remove("hidden");
  $("btn-post").disabled = false;
  $("btn-post").textContent = "POST IT";
  try {
    $("post-name").value = localStorage.getItem("lw_name") || commitHand(false) || "";
    $("post-local").value = localStorage.getItem("lw_local") || readGateLocal() || "";
  } catch (_) {}
  const hint = document.querySelector("#post-score .post-hint");
  if (hint) {
    const n = commitHand(false);
    hint.textContent = n
      ? "Posting as " + n + (readGateLocal() ? " · L." + readGateLocal() : "") + ". One slot per name per traveler. Work PTS rank the board."
      : "One slot per name per traveler. Work PTS rank the board — walking the site counts. Faster time wins a tie.";
  }
  autoPostWin(lastWinRec);
  hidePlayChrome();
  $("end-screen").classList.remove("hidden");
  if (state.drew && state.drew.mode === "chase") {
    state.drew.mode = "idle";
    radioFore(
      "Loop's green with Drew ten feet out. Tell him to eat that slip. That's a Book 2 finish, Utah.",
      "Gear's green with Drew ten feet out. Tell him to eat that slip. That's a Book 2 finish, Tremont."
    );
  } else if (cycleDay(day) === 2) {
    radioFore(
      "Walk test's clean. Hand the AHJ the paper and don't say nothing extra. Book 2 does it again.",
      "Walk test's clean. Hand the inspector the paper and don't say anything extra. Book 2 does it again."
    );
  } else {
    radioFore(
      "That's a loop, y'all. All four halls. Lugo's signing off. Book 2. Tell 237 it's green.",
      "That's a clean run. All four halls. Lemon's signing off. Book 2. Tell 237 it's green."
    );
  }
}

const HEAT_BARK = [
  {
    at: 0.14,
    utah: "This hallway's a convection oven. My pouch is melting.",
    tremont: "My boots are sweating. That's a first.",
  },
  {
    at: 0.28,
    utah: "One-ten easy. Who designed this, the sun?",
    tremont: "Hot aisle's trying to kill us. Keep walking.",
  },
  {
    at: 0.42,
    lugo: "That's the hot aisle, Utah. One-ten on the gun. Don't make a camp.",
    lemon: "One-ten in that cross. You ain't a server. Move.",
  },
  {
    at: 0.62,
    lugo: "You loiter in that hallway, you're going to cook. Move it.",
    lemon: "Tremont, that hallway is a pizza oven. Hustle through.",
  },
  {
    at: 0.78,
    lugo: "Heat illness is a write-up. Walk through, don't live there.",
  },
  {
    at: 0.88,
    drew: "If I find you laying in the aisle I'm calling heat illness and a slip.",
  },
];

function updateHeat(dt) {
  if (state.mode !== "play") return;
  const x = player.position.x;
  const z = player.position.z;
  const hot = inHotAisle(x, z);
  const moving =
    keys.KeyW ||
    keys.KeyA ||
    keys.KeyS ||
    keys.KeyD ||
    keys.ArrowUp ||
    keys.ArrowDown ||
    keys.ArrowLeft ||
    keys.ArrowRight ||
    (stick && stick.active) ||
    holdSprint ||
    dayState.driving ||
    dayState.utv;
  if (hot) {
    dayState.heat = Math.min(1, (dayState.heat || 0) + dt * (moving ? 0.036 : 0.088));
    if (!dayState.heatAnnounced) {
      dayState.heatAnnounced = true;
      toast("HOT AISLE · 110°+ · DON'T CAMP", true);
    }
  } else {
    dayState.heat = Math.max(0, (dayState.heat || 0) - dt * 0.15);
    if ((dayState.heat || 0) < 0.04) dayState.heatAnnounced = false;
  }
  // diff before writing — this runs every frame (same convention as the clock/zone HUD)
  const wrap = $("heat-meter");
  const veil = $("heat-veil");
  const shown = hot || (dayState.heat || 0) > 0.05;
  if (wrap && ui.heatShown !== shown) {
    ui.heatShown = shown;
    wrap.classList.toggle("hidden", !shown);
  }
  const f = 86 + Math.floor((dayState.heat || 0) * 32);
  if (ui.heatF !== f && $("heat-f")) {
    ui.heatF = f;
    $("heat-f").textContent = f + "°";
  }
  const pct = Math.round((dayState.heat || 0) * 100);
  if (ui.heatPct !== pct) {
    ui.heatPct = pct;
    const fill = $("heat-fill");
    if (fill) fill.style.width = pct + "%";
  }
  const veilOp = Math.round((hot ? 0.16 + dayState.heat * 0.5 : (dayState.heat || 0) * 0.1) * 100) / 100;
  if (veil && ui.heatVeil !== veilOp) {
    ui.heatVeil = veilOp;
    veil.style.opacity = String(veilOp);
  }
  renderer.toneMappingExposure = 1.05 + (hot ? 0.12 : 0) + (dayState.heat || 0) * 0.28;
  const stage = dayState.heatSaid || 0;
  const next = HEAT_BARK[stage];
  if (hot && next && dayState.heat >= next.at) {
    dayState.heatSaid = stage + 1;
    if (isTremont()) {
      if (next.tremont) speakAs("tremont", next.tremont);
      else if (next.lemon) speakAs("lemon", next.lemon);
      else if (next.drew) speakAs("drew", next.drew);
    } else {
      if (next.utah) speakAs("utah", next.utah);
      else if (next.lugo) speakAs("lugo", next.lugo);
      else if (next.drew) speakAs("drew", next.drew);
    }
    toast(f + "° · HOT AISLE", true);
  }
  if (!hot && (dayState.heat || 0) < 0.08) dayState.heatSaid = 0;
  if ((dayState.heat || 0) >= 1) {
    dayState.heat = 0;
    fail("heat");
  }
}

function fail(reason = "ot") {
  state.mode = "end";
  sfx("bad");
  vib([200, 80, 200]);
  track("shift_fail", { pts: state.watts, shocks: state.shocks, reason, day });
  addWallet(Math.floor(state.watts / 2)); // half pay on a laid-off day
  clearCheckpoint();
  hidePlayChrome();
  $("end-best").textContent = "";
  $("end-bonus").textContent = "";
  $("btn-next-day").classList.add("hidden");
  $("post-score").classList.add("hidden");
  postProgress(failRank(reason));
  if (reason === "inspection") {
    $("end-eye").textContent = isTremont() ? "INSPECTOR · RED TAG" : "AHJ · RED TAG";
    $("end-title").textContent = "FAILED INSPECTION";
    $("end-rank").textContent = "RE-WALK MONDAY";
    $("end-watts").textContent = state.watts.toLocaleString();
    $("end-time").textContent = formatTime(Math.max(0, shiftLen - state.time + state.overtime));
    $("end-shocks").textContent = state.shocks;
    $("end-screen").classList.remove("hidden");
    radioFore(
      "Three corrections. He red-tagged it. We re-walk Monday and Drew eats the cost. Rough day, Utah.",
      "Three corrections. He red-tagged it. We re-walk Monday and Drew eats the cost. Rough day, Tremont."
    );
    return;
  }
  if (reason === "heat") {
    $("end-eye").textContent = "DREW · GENERAL FOREMAN";
    $("end-title").textContent = "HEAT ILLNESS";
    $("end-rank").textContent = "COOKED IN THE AISLE";
    $("end-watts").textContent = state.watts.toLocaleString();
    $("end-time").textContent = formatTime(Math.max(0, shiftLen - state.time + state.overtime));
    $("end-shocks").textContent = state.shocks;
    $("end-screen").classList.remove("hidden");
    speakAs("drew", "You passed out in the hot aisle. Heat illness. Slip's in the trailer. Drink water next time.");
    return;
  }
  $("end-eye").textContent = "DREW · GENERAL FOREMAN";
  $("end-title").textContent = "LAYOFF SLIP";
  $("end-rank").textContent = "BACK ON THE BOOKS";
  $("end-watts").textContent = state.watts.toLocaleString();
  $("end-time").textContent = "OT";
  $("end-shocks").textContent = state.shocks;
  $("end-screen").classList.remove("hidden");
  radioFore(
    reason === "slip"
      ? "Drew found you. Slip's got your name spelled right. 237 will call again, Utah."
      : "That's the whole OT window. Drew's leaving your slip at the trailer. Rough one, Utah.",
    reason === "slip"
      ? "Drew found you. Slip's got your name spelled right. 237 will call again, Tremont."
      : "That's the whole OT window. Drew's leaving your slip at the trailer. Rough one, Tremont."
  );
}

/* ------------------------------------------------------------------ */
/*  CAMERA / LOOP                                                      */
/* ------------------------------------------------------------------ */
function updatePlayer(dt) {
  let ix = 0,
    iz = 0;
  if (keys.KeyW || keys.ArrowUp) iz += 1;
  if (keys.KeyS || keys.ArrowDown) iz -= 1;
  if (keys.KeyA || keys.ArrowLeft) ix -= 1;
  if (keys.KeyD || keys.ArrowRight) ix += 1;
  ix += stick.x;
  iz -= stick.y;
  const mag = Math.hypot(ix, iz);
  if (mag > 1) {
    ix /= mag;
    iz /= mag;
  }

  // hysteresis so the walk/sprint boundary doesn't flutter under a thumb
  const kb = keys.ShiftLeft || keys.ShiftRight || holdSprint;
  if (sprintOn) {
    if (mag < 0.7 && !kb) sprintOn = false;
  } else if (mag > 0.85 || kb) {
    sprintOn = true;
    if (!sprintTaught && isCoarse() && mag > 0.85) {
      sprintTaught = true;
      toast("THAT'S A HUSTLE");
    }
  }
  const sprint = sprintOn && (mag > 0.12 || kb) && !dayState.carrying && !dayState.pushCart;
  let speed = sprint ? 9.0 : 6.1;
  if (dayState.workoutT > 0) speed = 0; // mid-set — finish the push-ups first
  if (dayState.carrying) speed *= 0.62; // a reel on the shoulder is a reel on the shoulder
  if (dayState.pushCart) speed *= 0.85; // the cart's got a wobble wheel
  if (state.speedBoost > 0) {
    speed *= 1.28;
    state.speedBoost -= dt;
  }
  if ((dayState.heat || 0) > 0.22) {
    speed *= 1 - Math.min(0.5, (dayState.heat - 0.22) * 0.7);
  }
  // airborne clears the puddle — hopping them is a real move
  if (player.position.y < 0.2 && inWet(player.position.x, player.position.z)) {
    speed *= 0.55;
    if (!dayState.wetSaid) {
      dayState.wetSaid = true; // once a shift is plenty
      radio(pickLine(radioPack().wet));
    }
  }
  if (player.position.z > CB.z1 + 26) {
    speed *= 0.28;
    if (!state.swam) {
      state.swam = true;
      radioFore(
        "That's Lake Ontario, Utah. CB-4 is the other way.",
        "That's Lake Ontario. CB-4 is the other way, Tremont."
      );
      toast("LAKE ONTARIO", true);
    }
  }

  const cy = Math.cos(cam.yaw);
  const sy = Math.sin(cam.yaw);
  // camera forward is (sy, cy); screen-right is (-cy, sy) — not (cy, -sy),
  // which mirrored left/right strafe
  const fx = sy * iz - cy * ix;
  const fz = cy * iz + sy * ix;

  if (dayState.utv) {
    updateUtv(dt, ix, iz, mag, fx, fz);
    return;
  }

  // behind the wheel of the blue scissor: the stick drives the lift
  if (dayState.driving && state.driveLift) {
    const L = state.driveLift.mesh;
    // raise / lower — Space and C on a keyboard, the ▲▼ buttons on a phone
    const up = keys.Space || dayState.liftUp;
    const dn = keys.KeyC || dayState.liftDn; // no Ctrl — Ctrl+W while steering closes the tab
    const maxH = Math.min(LIFT_TOP, liftCeilingAt(L.position.x, L.position.z) - 2.7) - LIFT_STOW;
    liftSndT -= dt;
    if (up && !dn && dayState.liftH < maxH) {
      dayState.liftH = Math.min(maxH, dayState.liftH + 1.5 * dt);
      if (!dayState.saidUp) {
        dayState.saidUp = true;
        speakAs(getTraveler() === "tremont" ? "tremont" : "utah",
          getTraveler() === "tremont" ? "Going up. Don't park in front of my Ford." : "Going up. Somebody hold my coffee.");
      }
      if (liftSndT <= 0) {
        sfx("step");
        liftSndT = 0.34;
      }
    } else if (dn && !up && dayState.liftH > 0) {
      dayState.liftH = Math.max(0, dayState.liftH - 1.9 * dt);
      if (liftSndT <= 0) {
        sfx("step");
        liftSndT = 0.34;
      }
    }
    // a doorway header pushes the deck down — ramped, not teleported
    const capH = Math.max(0, maxH);
    if (dayState.liftH > capH) dayState.liftH = Math.max(capH, dayState.liftH - 6 * dt);
    applyLift();
    // from the deck you work, you don't stargaze — keeps the camera under the roof
    if (dayState.liftH > 0.5) cam.pitch = Math.max(cam.pitch, -0.12);
    const elevated = dayState.liftH > 0.9;
    if (elevated && maxH > 4.5 && dayState.liftH >= maxH - 0.05 && !dayState.toppedOut) {
      dayState.toppedOut = true;
      addWatts(250, "HIGH WORK");
      toast("TOPPED OUT — TIE OFF");
      radioFore(
        "If y'all are working up there, y'all are tied off. I ain't calling your mother.",
        "If you're working up there, you're tied off. I'm not calling your mother."
      );
      track("lift_up", { day });
    }
    const sp = elevated ? 1.2 : 3.7; // elevated it creeps — that's what the operator card says
    const hit2 = collideXZ(L.position.x + fx * sp * dt, L.position.z + fz * sp * dt, 1.2, 0);
    L.position.x = hit2.x;
    L.position.z = hit2.z;
    if (mag > 0.12) {
      facing = Math.atan2(fx, fz);
      L.rotation.y = facing;
    }
    player.position.set(L.position.x, 1.12 + dayState.liftH, L.position.z);
    player.rotation.y = facing;
    pvel.x = pvel.z = pvel.y = 0;
    kick.x = kick.z = 0; // stale knockback must not fire on dismount
    grounded = true;
    const udl = body.userData;
    udl.armL.rotation.x = -0.35;
    udl.armR.rotation.x = -0.35;
    udl.legL.rotation.x = 0;
    udl.legR.rotation.x = 0;
    return;
  }

  pvel.x = fx * speed;
  pvel.z = fz * speed;
  pvel.y += -24 * dt;

  const kdecay = Math.max(0, 1 - 6 * dt);
  kick.x *= kdecay;
  kick.z *= kdecay;

  let x = player.position.x + (pvel.x + kick.x) * dt;
  let z = player.position.z + (pvel.z + kick.z) * dt;
  const hit = collideXZ(x, z, PLAYER_R);
  player.position.x = hit.x;
  player.position.z = hit.z;
  player.position.y += pvel.y * dt;
  const gh = groundH(player.position.x, player.position.z);
  if (player.position.y <= gh) {
    player.position.y = gh;
    pvel.y = 0;
    grounded = true;
  } else grounded = false;

  if (mag > 0.12) {
    facing = Math.atan2(fx, fz);
    stepAcc += dt * speed;
    if (stepAcc > 0.42) {
      stepAcc = 0;
      sfx("step");
    }
  }
  player.rotation.y = facing;

  const moving = mag > 0.12 && grounded;
  const w = moving ? performance.now() * 0.012 * (sprint ? 1.35 : 1) : 0;
  const ud = body.userData;
  if (dayState.workoutT > 0) {
    dayState.workoutT -= dt;
    const phase = 1 - Math.max(0, dayState.workoutT) / 1.85;
    // push-up set on the iron — Tremont's real work order
    const reps = Math.sin(phase * Math.PI * 5); // ~2.5 push-ups
    const down = (1 - reps) * 0.5; // 0 = top, 1 = bottom
    body.position.y = -0.32 * down;
    body.rotation.x = 0.42 * down; // lean into the plank
    ud.armL.rotation.x = -1.15 - 1.15 * down;
    ud.armR.rotation.x = -1.15 - 1.15 * down;
    ud.legL.rotation.x = 0.08;
    ud.legR.rotation.x = 0.08;
    if (dayState.workoutT <= 0) {
      body.rotation.x = 0;
      body.position.y = 0;
      dayState.workoutT = 0;
    }
    return;
  }
  body.rotation.x = 0;
  body.position.y = 0;
  ud.armL.rotation.x = moving ? Math.sin(w) * 0.7 : Math.sin(performance.now() * 0.002) * 0.04;
  ud.armR.rotation.x = moving ? Math.sin(w + Math.PI) * 0.7 : 0;
  ud.legL.rotation.x = moving ? Math.sin(w + Math.PI) * 0.7 : 0;
  ud.legR.rotation.x = moving ? Math.sin(w) * 0.7 : 0;
  if (!grounded) {
    ud.legL.rotation.x = 0.4;
    ud.legR.rotation.x = 0.15;
  }
}

function pointInCollider(x, z, y = 1.4) {
  for (const b of state.colliders) {
    if (y > b.y + b.h) continue;
    if (x > b.minx + 0.1 && x < b.maxx - 0.1 && z > b.minz + 0.1 && z < b.maxz - 0.1) return true;
  }
  return false;
}

function updateCamera(dt) {
  if (window.__lwLook) {
    const L = window.__lwLook;
    camera.up.set(0, 1, 0);
    camera.position.set(L.x, L.y, L.z);
    camera.lookAt(L.ax, L.ay, L.az);
    if (L.fogFar) {
      scene.fog.near = L.fogNear || 120;
      scene.fog.far = L.fogFar;
    }
    return;
  }
  const px = player.position.x;
  const py = player.position.y;
  const pz = player.position.z;
  let d = dayState.utv ? 6.5 : cam.dist;
  let tx = px;
  let ty = py + 1.7;
  let tz = pz;
  let found = false;
  for (let i = 0; i < 12; i++) {
    const cx = px - Math.sin(cam.yaw) * Math.cos(cam.pitch) * d;
    const cy = py + 1.85 - Math.sin(cam.pitch) * d * 0.85;
    const cz = pz - Math.cos(cam.yaw) * Math.cos(cam.pitch) * d;
    if (!pointInCollider(cx, cz, cy)) {
      tx = cx;
      ty = cy;
      tz = cz;
      found = true;
      break;
    }
    d *= 0.72;
    if (d < 1.15) break;
  }
  // hallways are tighter than cam.dist — sit over the shoulder, never inside the mesh
  if (!found) {
    tx = px + Math.sin(cam.yaw) * 0.2;
    ty = py + 1.72;
    tz = pz + Math.cos(cam.yaw) * 0.2;
  }
  // fps-independent smoothing (0.16/frame at 60fps, same feel at 30)
  camera.position.lerp(tmp.v.set(tx, ty, tz), 1 - Math.pow(0.84, (dt || 0.016) * 60));
  if (shakeT > 0) {
    shakeT = Math.max(0, shakeT - (dt || 0.016));
    camera.position.x += (Math.random() - 0.5) * shakeT * 0.55;
    camera.position.y += (Math.random() - 0.5) * shakeT * 0.35;
  }
  camera.lookAt(px, py + 1.25, pz);
}

function updateInteract() {
  let best = null;
  let bestScore = Infinity;
  const px = player.position.x;
  const pz = player.position.z;
  const cur = currentJob();
  for (const it of state.interactables) {
    if (it.done) continue;
    const d = Math.hypot(it.x - px, it.z - pz);
    if (d > INTERACT && !(it.liftDrive && dayState.driving && !dayState.utv) && !(it.utv && dayState.utv)) continue;
    // bias toward what the camera is facing, and toward the current job
    const ang = Math.atan2(it.x - px, it.z - pz) - cam.yaw;
    let score = d - Math.cos(ang) * 0.9;
    if (cur && it.id === cur.id) score -= 0.5;
    // under your boots the deck has no bearing — fixed score so faced work
    // in reach beats "Step off", and "Step off" holds when nothing else does
    if (it.liftDrive && dayState.driving && !dayState.utv) score = 1.45;
    if (it.utv && dayState.utv === it.utvRef) score = 1.4;
    if (score < bestScore) {
      bestScore = score;
      best = it;
    }
  }
  state.nearest = best;
  const promptLabel = best && jobReady(best.id) ? shownLabel(best.label) : null;
  if (promptLabel !== ui.promptLabel) {
    ui.promptLabel = promptLabel;
    if (promptLabel) {
      $("prompt").classList.remove("hidden");
      $("prompt-text").textContent = promptLabel;
      $("prompt").querySelector("kbd").textContent = isCoarse() ? "⚡" : "E";
    } else {
      $("prompt").classList.add("hidden");
    }
  }

  const zone = zoneName(px, pz);
  if (zone !== ui.zone) {
    ui.zone = zone;
    const zl = $("zone-line");
    if (zl) zl.textContent = zone;
  }

  const job = currentJob();
  if (job) {
    // day 5: point at the rack when empty-handed, at a drop spot when loaded
    const target = state.interactables.find(
      (i) => i.id === job.id && !i.done && !(dayState.carrying ? i.reelSrc : i.reelTarget)
    );
    if (target) {
      const ang = Math.atan2(target.x - px, target.z - pz) - cam.yaw;
      // positive relative bearing is screen-LEFT; CSS rotation is clockwise
      const deg = Math.round((-ang * 180) / Math.PI);
      if (ui.needleDeg !== deg) {
        ui.needleDeg = deg;
        $("needle").style.transform = `rotate(${deg}deg)`;
      }
    }
  }
}

function updateCrew(dt, t) {
  const px = player.position.x;
  const pz = player.position.z;
  for (const c of state.crew) {
    const ud = c.mesh.userData;
    if (!ud) continue;
    // crew past the fog line reads as noise on a phone — skip the draws
    if (!c.lift) {
      const vis = Math.hypot(px - c.mesh.position.x, pz - c.mesh.position.z) < 64;
      if (c.mesh.visible !== vis) c.mesh.visible = vis;
      if (!vis) continue;
    }
    if (c.followLift && dayState.driving && !dayState.utv && state.driveLift && state.driveLift.mesh) {
      const L = state.driveLift.mesh;
      const yaw = L.rotation.y;
      const back = 3.4;
      const side = 2.15;
      const tx = L.position.x - Math.sin(yaw) * back + Math.cos(yaw) * side;
      const tz = L.position.z - Math.cos(yaw) * back - Math.sin(yaw) * side;
      const dx = tx - c.mesh.position.x;
      const dz = tz - c.mesh.position.z;
      const dist = Math.hypot(dx, dz);
      const spd = 4.4;
      if (dist > 0.4) {
        const step = Math.min(dist, spd * dt);
        c.mesh.position.x += (dx / dist) * step;
        c.mesh.position.z += (dz / dist) * step;
        c.mesh.rotation.y = Math.atan2(dx, dz);
        const wlk = t * 12;
        ud.armL.rotation.x = Math.sin(wlk) * 0.5;
        ud.armR.rotation.x = -0.75;
        ud.legL.rotation.x = Math.sin(wlk + Math.PI) * 0.7;
        ud.legR.rotation.x = Math.sin(wlk) * 0.7;
      } else {
        c.mesh.rotation.y = Math.atan2(L.position.x - c.mesh.position.x, L.position.z - c.mesh.position.z);
        ud.armL.rotation.x = 0;
        ud.armR.rotation.x = -0.75;
        ud.legL.rotation.x = 0;
        ud.legR.rotation.x = 0;
      }
      if (!c.nextBark || c.nextBark < t - 40) c.nextBark = t + 1.2;
      if (t >= c.nextBark) {
        const lines = BARK.safety;
        if (lines && lines.length) {
          c.barkI = (c.barkI || 0) % lines.length;
          speakAs("safety", lines[c.barkI]);
          c.barkI += 1;
        }
        c.nextBark = t + 3.2 + Math.random() * 2.4;
      }
      continue;
    }
    if (c.path && c.path.length > 1) {
      if (c.pause) {
        // huddled up with the GF — stand still, keep the radio arm up
        ud.legL.rotation.x = 0;
        ud.legR.rotation.x = 0;
        ud.armL.rotation.x = Math.sin(t * 1.7) * 0.1;
        continue;
      }
      const a = c.path[c.i];
      const b = c.path[(c.i + 1) % c.path.length];
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const len = Math.hypot(dx, dz) || 1;
      c.u += (c.speed * dt) / len;
      if (c.u >= 1) {
        c.u -= 1;
        c.i = (c.i + 1) % c.path.length;
      }
      c.mesh.position.x = a[0] + dx * c.u;
      c.mesh.position.z = a[1] + dz * c.u;
      c.mesh.rotation.y = Math.atan2(dx, dz);
      const w = t * 9 * c.speed;
      ud.armL.rotation.x = Math.sin(w) * 0.65;
      ud.armR.rotation.x = c.hold === "radio" ? -1.25 : c.hold === "clipboard" ? -0.75 : Math.sin(w + Math.PI) * 0.65;
      ud.legL.rotation.x = Math.sin(w + Math.PI) * 0.65;
      ud.legR.rotation.x = Math.sin(w) * 0.65;
      const dxp = player.position.x - c.mesh.position.x;
      const dzp = player.position.z - c.mesh.position.z;
      if (c.kit === "safety" || c.kit === "andy") {
        // repeat-bark NPCs: keep talking while the player hangs around,
        // cycling their lines instead of the one-shot the generic crew gets
        if (Math.hypot(dxp, dzp) < 4.6 && t > 2) {
          if (!c.nextBark || t >= c.nextBark) {
            const lines = BARK[c.kit];
            if (lines && lines.length) {
              c.barkI = (c.barkI || 0) % lines.length;
              speakAs(NPC_VOICE[c.kit] || "crew", lines[c.barkI]);
              c.barkI += 1;
            }
            // Andy paces his ask; the safety lady stays on your heels
            c.nextBark = t + (c.kit === "andy" ? 5.5 + Math.random() * 3.5 : 3.5 + Math.random() * 2.5);
          }
        }
      } else if (!c.said && Math.hypot(dxp, dzp) < 3.1 && t > 5) {
        c.said = true;
        const lines =
          c.kit === "foreman"
            ? (() => {
                const dayLines = isTremont() ? (DAY_IDLE_LEMON[day] || DAY_IDLE_LEMON[cycleDay(day)]) : (DAY_IDLE[day] || DAY_IDLE[cycleDay(day)]);
                const generic = isTremont() ? BARK.foremanLemon : BARK.foreman;
                return dayLines && dayLines.length ? dayLines.concat(generic) : generic;
              })()
            : c.kit === "oconnell" && isTremont()
              ? BARK.oconnellTremont
              : BARK[c.kit];
        if (lines) {
          const barkRole =
            c.kit === "foreman" ? foremanWho() : NPC_VOICE[c.kit] || "crew";
          speakAs(barkRole, lines[Math.floor(Math.random() * lines.length)]);
        }
      }
    } else if (c.joeGuy) {
      const jm = state.joe && state.joe.mesh;
      if (jm) c.mesh.rotation.y = Math.atan2(jm.position.x - c.mesh.position.x, jm.position.z - c.mesh.position.z);
      const mad = state.joe && state.joe.inRange ? 1.5 : 1;
      ud.armR.rotation.x = -0.45 + Math.sin(t * 2.5 * mad + c.phase) * 0.2;
      ud.armL.rotation.x = -0.18;
      ud.legL.rotation.x = 0;
      ud.legR.rotation.x = 0;
    } else if (c.work) {
      ud.armR.rotation.x = -0.85 + Math.sin(t * 5.5 + c.phase) * 0.55;
      ud.armL.rotation.x = -0.25 + Math.sin(t * 2.2 + c.phase) * 0.12;
    } else if (c.lift) {
      ud.armR.rotation.x = -0.55 + Math.sin(t * 2.4 + c.phase) * 0.3;
      ud.armL.rotation.x = -0.2;
    }
  }
  for (const L of state.lifts) {
    const vis = Math.hypot(px - L.mesh.position.x, pz - L.mesh.position.z) < 72;
    if (L.mesh.visible !== vis) L.mesh.visible = vis;
    if (!vis) continue;
    if (L.swing && L.turret) L.turret.rotation.y = Math.sin(t * 0.22 + L.t) * 0.4;
    if (L.rise && L.plat) {
      const y = L.h + Math.sin(t * 0.35 + L.t) * 0.55;
      L.plat.position.y = y;
      if (L.sc) L.sc.scale.y = y / L.h;
    }
  }
  if (state.weld) {
    state.weld.intensity = Math.random() > 0.35 ? 1.8 + Math.random() * 2 : 0.15;
  }
  if (state.lake) state.lake.position.y = -0.22 + Math.sin(t * 0.35) * 0.04;
}

function updateHazards(dt, t) {
  // sparks
  for (const s of state.sparks) {
    if (!s.live) continue;
    s.t += dt;
    const pulse = 0.6 + Math.sin(s.t * 18) * 0.4;
    s.light.intensity = pulse * 1.4;
    s.tip.scale.setScalar(0.7 + pulse * 0.6);
    if (!dayState.driving && Math.hypot(player.position.x - s.x, player.position.z - s.z) < 0.85) {
      const f = state.forklift;
      const onFork =
        f && Math.hypot(player.position.x - f.mesh.position.x, player.position.z - f.mesh.position.z) < 2.2;
      if (!onFork && (!s.cd || t > s.cd)) {
        s.cd = t + 1.1;
        hurt(1, "zap");
        const ddx = player.position.x - s.x;
        const ddz = player.position.z - s.z;
        const dm = Math.hypot(ddx, ddz) || 0.001;
        kick.x = (ddx / dm) * 11;
        kick.z = (ddz / dm) * 11;
      }
    }
  }

  updateCrew(dt, t);

  // forklift patrol
  if (state.forklift) {
    const f = state.forklift;
    f.t += dt * (cycleDay(day) === 7 ? 0.62 : 0.35) * f.dir; // energize day: everyone drives stupid
    if (f.t > 1 || f.t < 0) f.dir *= -1;
    const x = -16 + f.t * 28;
    const z = 30;
    f.mesh.position.set(x, 0, z);
    f.mesh.rotation.y = f.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    if (!dayState.driving && !dayState.utv && Math.hypot(player.position.x - x, player.position.z - z) < 1.5) {
      if (!f.cd || t > f.cd) {
        f.cd = t + 1.4;
        hurt(1, "fork");
        const ddx = player.position.x - x;
        const ddz = player.position.z - z;
        const dm = Math.hypot(ddx, ddz) || 0.001;
        kick.x = (ddx / dm) * 13;
        kick.z = (ddz / dm) * 13;
      }
    }
  }

  if (state.craneHook) {
    const bob = Math.sin(t * 0.7) * 1.6;
    state.craneHook.position.y = 6.5 + bob;
    if (state.craneHook.userData.load) state.craneHook.userData.load.position.y = 5.4 + bob;
  }

  if (state.mode === "play") {
    updateDrew(dt, t);
    updateJoe(dt, t);
    updateChris(dt, t);
    updateDon(dt, t);
    updateDayMechanics(dt, t);
  }
  updateFx(dt);

  // the mascot spooks when Utah gets close
  if (state.gull) {
    const g = state.gull;
    if (!g.flying) {
      if (
        state.mode === "play" &&
        Math.hypot(player.position.x - g.mesh.position.x, player.position.z - g.mesh.position.z) < 4.2
      ) {
        g.flying = true;
        g.t = 0;
        toast("237'S MASCOT");
        sfx("gull");
        track("egg_gull", {});
      }
    } else if (g.mesh.visible) {
      g.t += dt;
      g.mesh.position.y += dt * 5;
      g.mesh.position.x += dt * 7;
      g.mesh.position.z += dt * 3;
      g.mesh.rotation.y = 0.9;
      g.mesh.rotation.z = Math.sin(g.t * 16) * 0.4;
      if (g.mesh.position.y > 26) g.mesh.visible = false;
    }
  }

  // float markers
  for (const it of state.interactables) {
    if (!it.marker) continue;
    if (it.done) {
      it.marker.visible = false;
      continue;
    }
    if (it.marker.userData.baseY == null) it.marker.userData.baseY = it.marker.position.y;
    it.marker.rotation.y += dt * 2;
    it.marker.position.y = it.marker.userData.baseY + Math.sin(t * 3 + it.x) * 0.12;
  }

  if (state.faLive && state.strobes.length) {
    const on = Math.floor(t * 2) % 2 === 0;
    if (on !== state._strobeOn) {
      state._strobeOn = on;
      for (const s of state.strobes) {
        if (!s.mounted || !s.lens) continue;
        s.lens.material.emissive.setHex(on ? (isTremont() ? 0x3cff6a : 0xffffff) : 0x000000);
        s.lens.material.emissiveIntensity = on ? (isTremont() ? 1.4 : 2.4) : 0;
      }
    }
    if (state.faHorns > 0 && (!state._hornT || t > state._hornT)) {
      state._hornT = t + 4.2; // full temporal-3 cycle plus rest
      state.faHorns--;
      sfx("horn");
    }
  }
}

const UTAH_RANDOM = [
  "It's throat punch Thursday.",
  "Do you even know what you're doing?",
  "Mood enhancing drugs, anybody?",
  "This hall's crooked. Not my work — the HALL.",
  "Tell Drew my numbers are beautiful.",
  "I've seen better bends in a garden hose.",
  "Somebody's playing country in pod three and it's ruining my splice.",
  "Book 2 does it better. That's not bragging, that's data.",
  "I'm a Mormon.",
  "I'm a virgin!",
];

const TREMONT_RANDOM = [
  "Who's skipping leg day on my site?",
  "Form over force. That's a clean bend.",
  "Hydrate. Water. That's the whole sermon.",
  "Strong people. Strong community. Strong circuit.",
  "I've seen better form on a gas-station pull-up bar.",
  "Book 2, Tremont. Built different.",
  "Tell Lemon the set's done and the device is landed.",
  "No candy cart. Never a candy cart.",
  "Recover after the shift. Work during it.",
  "Chest tight. Mind clear. Next device.",
  "F-150's in the south lot. PowerBoost. Don't block it.",
  "Ford in the lot, iron in the hall. That's the day.",
  "After this pull I'm hitting the gym. Not the vending machine.",
  "Tow package, Pro Power, and a circuit that actually lands.",
  "If you need a ride to the hall, I drive American.",
  "Squenchers are poison.",
  "Hydrate. Not that colored sugar water.",
  "You can keep the Squenchers. I'll take the water and the truck.",
  "Gym, Ford, water. Squenchers didn't make the list.",
  "Squenchers are still poison. That's the last time I'm saying it.",
];
const LUGO_CHAT = [
  "Y'all need something, or y'all just admiring the foreman?",
  "Water's in the conex. Hydrate or die-drate, y'all.",
  "If Drew asks, I said something inspirational.",
  "Quit talking to me and go make us look good, y'all.",
];
const LEMON_CHAT = [
  "You need something, or are you stretching?",
  "Water's in the conex. Then get back on the stick.",
  "If Drew asks, I said stay productive.",
  "Quit talking. Finish the device and the set.",
  "Strong people show up. You're already on the clock — use it.",
  "Tremont's Ford is in the south lot. Don't make him move it twice.",
  "Gym after the whistle. Circuit before it.",
  "Water's in the conex. Squenchers are still poison.",
  "Tell Tremont I heard him on Squenchers. He can drop it now.",
];
const DAY_IDLE = {
  1: [
    "Red conduit is fire alarm. Don't land it on a lighting circuit, y'all.",
    "Boxes, smokes, strobes, then my panel. That's the order.",
    "Ferguson's on the east electrical. That's their gear. We're O'Connell fire alarm.",
  ],
  2: [
    "Mag every smoke. AHJ doesn't care how pretty the pipe is if the loop lies.",
    "Troubles first, then EOLs, then we walk the panel.",
    "AHJ's tomorrow. Don't leave me a chirp overnight.",
  ],
  3: [
    "He's writing with the good pen, y'all. That's never free.",
    "Walk sheet says demo 'em clean. He signs, we eat.",
    "Blue diamond is next. Beat him there.",
  ],
  4: [
    "Utility's locked out. That diesel east of the south doors is the building tonight.",
    "Battery strobes and ducts while she's running. Then transfer back to normal.",
    "If the halls go dark, the tests don't count. Fuel her.",
  ],
  5: [
    "Pull smooth, not hard. Cable remembers, y'all.",
    "Reels don't walk themselves. That's what Utah's for.",
    "Stage every pod before you tug. Don't starve the pull.",
  ],
  6: [
    "The list is the list, y'all. Drew wrote it, Drew signs it.",
    "No markers today. You know this site or you don't.",
  ],
  7: [
    "Whole site's watching CB-4 today. Look busy AND be busy, y'all.",
    "After energize, nobody touches nothing. Y'all hear me?",
    "Three pens, then the big one. Don't get cute.",
  ],
};
const DAY_IDLE_LEMON = {
  1: [
    "Lighting is lighting. Don't land it on somebody else's gear.",
    "Boxes, lights, recs, then my gear. That's the order. Don't skip it.",
    "Ferguson owns the east electrical. We're power. Stay in our lane.",
  ],
  2: [
    "Meg every feeder. The inspector doesn't care how pretty the EMT is if the run lies.",
    "Opens first, then homeruns, then we walk the gear.",
    "Inspector's tomorrow. Don't leave me a trip overnight.",
  ],
  3: [
    "He's writing with the good pen. That's never free.",
    "Walk sheet says demo them clean. He signs, we eat.",
    "Blue diamond is next. Beat him there. No posing.",
  ],
  4: [
    "Utility's locked out. That diesel east of the south doors is the building tonight.",
    "Emergency lights and sensors while she's running. Then transfer back to normal.",
    "If the halls go dark, the tests don't count. Fuel her.",
  ],
  5: [
    "Pull smooth, not hard. Cable remembers.",
    "Reels don't walk themselves. That's the job, Tremont.",
    "Stage every pod before you tug. Don't starve the pull.",
  ],
  6: [
    "The list is the list. Drew wrote it, Drew signs it. Clear it.",
    "No markers today. You know this site or you don't.",
  ],
  7: [
    "Whole site's watching CB-4. Look busy and be busy.",
    "After energize, nobody touches nothing. You hear me?",
    "Three pens, then the big one. Don't get cute.",
  ],
};

let utahChatT = 45;

let idleRadio = 18;

/* fraction of the fire-alarm scope that's landed — Drew reads these numbers */
function paceFraction() {
  let done = 0;
  let need = 0;
  for (const j of JOBS) {
    if (!j.fa) continue;
    done += state.progress[j.id];
    need += needFor(j.id);
  }
  return need ? done / need : 0;
}

function updateClock(dt) {
  if (state.time > 0) {
    state.time -= dt;
    if (state.time < 0) state.time = 0;
    if (!state.drewWarn1 && state.time < shiftLen * 0.5 && paceFraction() < 0.35) {
      state.drewWarn1 = true;
      radioFore(
        "Drew's at the trailer asking about y'all's numbers, Utah.",
        "Drew's at the trailer asking about the numbers, Tremont."
      );
    }
    if (!state.drewWarn2 && state.time < shiftLen * 0.2 && paceFraction() < 0.7) {
      state.drewWarn2 = true;
      radioFore(
        "Drew's writing something on that clipboard. I can't hold him long.",
        "Drew's writing on that clipboard. I can't hold him. Finish the device."
      );
    }
  } else {
    if (!state.otStarted) {
      state.otStarted = true;
      startDrewChase();
    }
    state.overtime += dt;
    if (state.overtime > 90) fail("ot");
  }
  const el = $("clock");
  const txt = state.time > 0 ? formatTime(state.time) : "OT " + formatTime(90 - state.overtime);
  if (txt !== ui.clock) {
    ui.clock = txt;
    el.textContent = txt;
    const hot = state.time > 0 ? (state.time < 45 ? "#ff6a1a" : "") : "#ff3b2f";
    if (hot !== ui.clockHot) {
      ui.clockHot = hot;
      el.style.color = hot;
    }
  }
  idleRadio -= dt;
  if (idleRadio < 0 && state.mode === "play") {
    idleRadio = 22 + Math.random() * 16;
    const pool = idlePool();
    radio(pool[Math.floor(Math.random() * pool.length)]);
  }
  utahChatT -= dt;
  if (utahChatT < 0 && state.mode === "play") {
    utahChatT = 60 + Math.random() * 40;
    if (getTraveler() === "tremont") {
      const line = TREMONT_RANDOM[Math.floor(Math.random() * TREMONT_RANDOM.length)];
      speakAs("tremont", line);
      toastMutter(line);
    } else {
      const line = UTAH_RANDOM[Math.floor(Math.random() * UTAH_RANDOM.length)];
      speakAs("utah", line);
      toastMutter(line);
    }
  }
}

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.033, clock.getDelta());
  const t = clock.elapsedTime;
  if (state.mode === "play") {
    updatePlayer(dt);
    updateHeat(dt);
    updateInteract();
    updateWorkMarkers(dt, t);
    updateClock(dt);
  }
  netTick(dt);
  if (state.mode === "mag") updateMag(dt);
  if (state.mode === "pull") updatePull(dt);
  if (state.mode === "play" || state.mode === "mag" || state.mode === "pull") updateSiteRadio();
  // Title, pause and the mini-games fully cover or freeze the scene —
  // skip rendering there so idle screens don't burn battery.
  if (state.mode === "play" || state.mode === "end") {
    updateHazards(dt, t);
    updateCamera(dt);
    renderer.render(scene, camera);
  }
}

/* ------------------------------------------------------------------ */
/*  BOOT                                                               */
/* ------------------------------------------------------------------ */
// icons and button skins are pre-keyed transparent PNGs shipped in assets/
const iconURL = {};
for (const d of Object.values(DAYS)) for (const j of d.jobs) iconURL[j.id] = "/assets/" + j.icon.replace(".jpg", ".png");

/* ------------------------------------------------------------------ */
/*  STATIC WORLD MERGE                                                 */
/* ------------------------------------------------------------------ */
/* Collapse the ~2,000 individual static prop meshes into a handful of
   merged meshes (one per material look). Anything that moves, hides, or
   swaps materials at runtime is tagged userData.noBake and left alone. */
function mergeStaticWorld() {
  const groups = new Map();
  const doomed = [];
  const walk = (obj, blocked) => {
    const b = blocked || obj.userData.noBake === true;
    if (obj.isMesh && !b) {
      const m = obj.material;
      const g = obj.geometry;
      if (
        m &&
        m.isMeshLambertMaterial &&
        !m.transparent &&
        (!m.emissive || m.emissive.getHex() === 0) &&
        g &&
        g.index &&
        g.attributes.position &&
        g.attributes.normal &&
        g.attributes.uv
      ) {
        // textured props merge per texture; every flat color merges into
        // one vertex-colored mesh — a single draw for the whole set
        const flat = !m.map && !m.vertexColors;
        const key = flat ? "FLAT" : (m.map ? m.map.uuid : "vc") + "|" + m.color.getHex();
        let grp = groups.get(key);
        if (!grp) {
          grp = { mat: flat ? VERT_MAT : m, flat, geos: [] };
          groups.set(key, grp);
        }
        obj.updateWorldMatrix(true, false);
        const geo = g.clone().applyMatrix4(obj.matrixWorld);
        if (flat) colorizeGeo(geo, m.color);
        grp.geos.push(geo);
        doomed.push(obj);
      }
    }
    for (const c of obj.children) walk(c, b);
  };
  walk(scene, false);
  for (const d of doomed) d.parent?.remove(d);
  let merged = 0;
  for (const grp of groups.values()) {
    if (!grp.geos.length) continue;
    const g = BufferGeometryUtils.mergeGeometries(grp.geos, false);
    if (!g) continue;
    const mesh = new THREE.Mesh(g, grp.mat);
    mesh.matrixAutoUpdate = false;
    scene.add(mesh);
    merged++;
    for (const src of grp.geos) src.dispose();
  }
  return { removed: doomed.length, drawGroups: merged };
}

/* ------------------------------------------------------------------ */
/*  CHECKPOINT / RESET                                                 */
/* ------------------------------------------------------------------ */
const SAVE_VERSION = 6; // bump when interactable layout or save shape changes

function saveCheckpoint() {
  if (state.mode === "end") return;
  try {
    localStorage.setItem(
      saveKey(day),
      JSON.stringify({
        v: SAVE_VERSION,
        n: state.interactables.length,
        day,
        ts: Date.now(),
        seed: state.seed || 1,
        ex: {
          ahjIdx: dayState.ahjIdx,
          ahjDwell: Math.round(dayState.ahjDwell * 10) / 10,
          corrections: dayState.corrections,
          genT: Math.round(dayState.genT),
          ahjX: state.ahjNpc ? Math.round(state.ahjNpc.mesh.position.x * 10) / 10 : 0,
          ahjZ: state.ahjNpc ? Math.round(state.ahjNpc.mesh.position.z * 10) / 10 : 0,
        },
        progress: state.progress,
        done: state.done,
        doneIdx: state.interactables.map((it, i) => (it.done ? i : -1)).filter((i) => i >= 0),
        time: state.time,
        overtime: state.overtime,
        watts: state.watts,
        hp: state.hp,
        shocks: state.shocks,
        combo: state.combo,
        hasTools: state.hasTools,
        px: player.position.x,
        pz: player.position.z,
        yaw: cam.yaw,
      })
    );
  } catch (_) {}
}

function markItemDone(it) {
  it.done = true;
  if (it.marker) it.marker.visible = false;
  if (it.id === "tools" || it.coffee || it.tender) it.mesh.visible = false;
  if (it.conduit) it.conduit.visible = true;
  if (it.box) it.box.visible = true;
  if (it.smoke) setSmokeLook(it.smoke, true);
  if (it.strobe) setStrobeLook(it.strobe, true);
  if (it.vesda) dressVesda(it, true);
  if (it.reelTarget) placeSpoolAt(it.x, it.z); // resumed day 5 shows delivered reels
}

function applyCheckpoint(save) {
  // the live world may be AHEAD of the save (same-session quit→resume):
  // rebuild the day's items first so the save is the single source of truth
  rebuildDayItems();
  if (save.ex) {
    dayState.ahjIdx = save.ex.ahjIdx || 0;
    dayState.ahjDwell = save.ex.ahjDwell || 0;
    dayState.corrections = save.ex.corrections || 0;
    dayState.genT = save.ex.genT != null ? save.ex.genT : GEN_FEED;
    dayState.genTransferred = !!(save.done && save.done.facp && cycleDay(day) === 4);
    if (state.ahjNpc && cycleDay(day) === 3 && save.ex.ahjX) state.ahjNpc.mesh.position.set(save.ex.ahjX, 0, save.ex.ahjZ);
  }
  Object.assign(state.progress, save.progress);
  Object.assign(state.done, save.done);
  state.time = save.time;
  // huddles already seen before the save don't replay on resume
  state.huddleN = state.time < shiftLen * 0.38 ? 2 : state.time < shiftLen * 0.72 ? 1 : 0;
  state.overtime = save.overtime || 0;
  state.watts = save.watts;
  state.hp = save.hp;
  state.shocks = save.shocks;
  state.combo = save.combo || 0;
  state.hasTools = save.hasTools;
  if (cycleDay(day) === 4) {
    dayState.genTransferred = !!state.done.facp;
    applyNightPower();
  }
  for (const i of save.doneIdx || []) {
    const it = state.interactables[i];
    if (it) markItemDone(it);
  }
  player.position.set(save.px, 0, save.pz);
  cam.yaw = save.yaw || 0;
  const txt = state.watts.toLocaleString();
  $("watts").textContent = txt;
  $("watts-mini").textContent = "PTS " + txt;
  setHearts();
  refreshJobs();
}

function resetItem(it) {
  it.done = false;
  if (it.marker) {
    it.marker.visible = true;
    it.marker.material.color.setHex(it.marker.userData.baseColor ?? 0xff5a4a);
    if (it.marker.userData.baseY != null) it.marker.position.y = it.marker.userData.baseY;
  }
  if (it.id === "tools" || it.coffee || it.tender) it.mesh.visible = true;
  if (it.conduit) it.conduit.visible = false;
  if (it.box) it.box.visible = false;
  if (it.smoke) setSmokeLook(it.smoke, false);
  if (it.strobe) setStrobeLook(it.strobe, false);
  if (it.vesda) dressVesda(it, false);
}

function softReset() {
  // note: the checkpoint slot is NOT cleared here — a fresh start leaves the
  // old save resumable until the new run's first tick overwrites it
  state.time = shiftLen;
  state.overtime = 0;
  state.watts = 0;
  state.hp = 3;
  state.shocks = 0;
  state.combo = 0;
  state.hasTools = false;
  state.speedBoost = 0;
  state.swam = false;
  state.faLive = false;
  state.faHorns = 0;
  state._strobeOn = undefined;
  state._hornT = 0;
  state.otStarted = false;
  state.drewWarn1 = false;
  state.drewWarn2 = false;
  state.huddleN = 0;
  clearTimeout(state.huddleTimer);
  if (state.lugoRec) state.lugoRec.pause = false;
  dayState.highNudge = false;
  clearTimeout(state.drewBark);
  if (state.drew) {
    state.drew.mode = "patrol";
    state.drew.i = 0;
    state.drew.u = 0;
    state.drew.stuck = 0;
    state.drew.visitT = 0;
    state.drew.mesh.position.set(DREW_PATROL[0][0], 0, DREW_PATROL[0][1]);
    state.drew.mesh.visible = true;
  }
  if (state.joe) {
    state.joe.inRange = false;
    state.joe.introduced = false;
    state.joe.nextYell = 0;
  }
  if (state.don) {
    state.don.mode = "idle";
    state.don.i = 0;
    state.don.nextYell = 0;
    state.don.caught = false;
    state.don.stuck = 0;
    state.don.mesh.position.set(DON_HOME[0], 0, DON_HOME[1]);
    state.don.mesh.rotation.y = -0.4;
  }
  clearFx();
  if (state.gull) {
    state.gull.flying = false;
    state.gull.t = 0;
    state.gull.mesh.visible = true;
    state.gull.mesh.position.copy(state.gull.home);
    state.gull.mesh.rotation.set(0, 0.7, 0);
  }
  // per-day mechanics reset
  dayState.heat = 0;
  dayState.heatSaid = 0;
  dayState.heatAnnounced = false;
  if ($("heat-veil")) $("heat-veil").style.opacity = "0";
  if ($("heat-meter")) $("heat-meter").classList.add("hidden");
  renderer.toneMappingExposure = 1.05;
  dayState.ahjDwell = 0;
  dayState.ahjHold = 0;
  dayState.corrections = 0;
  dayState.genT = GEN_FEED;
  dayState.genWarned = false;
  dayState.genLow = false;
  dayState.genTransferred = false;
  dayState.carrying = false;
  dayState.candyCd = 0;
  dayState.andyGave = false; // Andy passes the hat fresh every shift
  dayState.pushCart = false;
  dayState.driving = false;
  dayState.utv = null;
  dayState.utvHop = false;
  dayState.utvStun = 0;
  dayState.utvAir = 0;
  dayState.utvRoll = 0;
  dayState.utvPitch = 0;
  dayState.liftH = 0;
  dayState.liftUp = false;
  dayState.liftDn = false;
  dayState.toppedOut = false;
  dayState.saidUp = false;
  applyLift();
  syncLiftBtns();
  utahChatT = 45;
  if (state.carrySpool) state.carrySpool.visible = false;
  if (state.ahjNpc) {
    state.ahjNpc.mesh.visible = cycleDay(day) === 3 || cycleDay(day) === 7;
    if (cycleDay(day) === 7) {
      const facp = worldItems.find((i) => i.id === "facp");
      state.ahjNpc.mesh.position.set(facp ? facp.x + 2.2 : -20, 0, facp ? facp.z + 1.2 : 66);
      state.ahjNpc.mesh.rotation.y = -Math.PI / 2;
    } else {
      state.ahjNpc.mesh.position.set(2, 0, 8);
    }
    state.ahjNpc.stuck = 0;
  }
  for (const s of state.sparks) {
    s.live = s.d7 ? cycleDay(day) === 7 : true;
    s.mesh.visible = s.live;
    s.tip.visible = s.live;
    s.light.visible = s.live;
  }
  setNight(cycleDay(day) === 4);
  ui.hint = undefined;
  $("compass").classList.toggle("hidden", false); // day 6 hides it only while punch items remain
  if (cycleDay(day) !== 6 && cycleDay(day) !== 7) $("punch-hint").classList.add("hidden");
  state.progress = Object.fromEntries(JOBS.map((j) => [j.id, 0]));
  state.done = Object.fromEntries(JOBS.map((j) => [j.id, false]));
  rebuildDayItems();
  // safety net: a level must NEVER ask for more devices than exist.
  // If a build/day ever comes up short, clamp the requirement and flag it.
  state.needs = {};
  for (const j of JOBS) {
    state.needs[j.id] = j.need;
    if (j.id === "tools") continue;
    const avail = state.interactables.filter((i) => i.id === j.id && (j.id === "reels" ? i.reelTarget : true)).length;
    if (avail < j.need) {
      console.warn("[LW] day", day, "job", j.id, "short:", avail, "<", j.need);
      track("job_short", { day, job: j.id, avail, need: j.need });
      // avail can legitimately be 0 (e.g. traveler-specific devices);
      // flooring at 1 would make the day unwinnable
      state.needs[j.id] = avail;
      if (avail === 0) state.done[j.id] = true;
    }
  }
  for (const led of state.racks) {
    led.material.emissive.setHex(0x000000);
    led.material.emissiveIntensity = 0;
  }
  player.position.set(SPAWN.x, 0, SPAWN.z);
  pvel.x = pvel.y = pvel.z = 0;
  kick.x = kick.z = 0;
  cam.yaw = 0;
  cam.pitch = -0.28;
  sprintOn = false;
  $("watts").textContent = "0";
  $("watts-mini").textContent = "PTS 0";
  ui.clock = "";
  ui.zone = "";
  ui.promptLabel = undefined;
  $("prompt").classList.add("hidden");
  setHearts();
  refreshJobs();
}

/* ------------------------------------------------------------------ */
/*  REAL SICK & NEEDY FUND                                             */
/*  This is REAL MONEY. Set url to an actual payment link (Venmo /     */
/*  PayPal.me / GoFundMe / Stripe Payment Link) that goes to the real  */
/*  fund, and say honestly in `note` where the money lands. Leave url  */
/*  empty and the whole feature stays hidden.                          */
/* ------------------------------------------------------------------ */
const REAL_FUND = {
  url: "",
  note: "Real money, opens in your browser. Goes to the local's sick & needy fund.",
};

function openRealFund() {
  if (!REAL_FUND.url) return;
  try {
    window.open(REAL_FUND.url, "_blank", "noopener");
  } catch (_) {}
  track("real_fund_tap", {});
}

function wireRealFund() {
  if (!REAL_FUND.url) return;
  $("btn-real-fund")?.classList.remove("hidden");
  $("btn-real-fund-pause")?.classList.remove("hidden");
  const note = $("real-fund-note-pause");
  if (note) {
    note.textContent = REAL_FUND.note;
    note.classList.remove("hidden");
  }
}
wireRealFund();

/* ------------------------------------------------------------------ */
/*  PAUSE / SETTINGS                                                   */
/* ------------------------------------------------------------------ */
function pauseGame() {
  if (state.mode !== "play") return;
  state.mode = "pause";
  resetTransientInput();
  const copy = $("pause-copy");
  if (copy) {
    copy.textContent = isTremont()
      ? "Lemon's still got your time. He doesn't need to know you're sitting."
      : "Lugo's still got your time. He doesn't need to know you're sitting.";
  }
  $("pause-screen").classList.remove("hidden");
  setDrone(false);
  stopVoice();
  if (SITE_RADIO.gain) SITE_RADIO.gain.gain.value = 0;
  if (UTV_RADIO.gain) UTV_RADIO.gain.gain.value = 0;
  saveCheckpoint();
}

function resumeGame() {
  if (state.mode !== "pause") return;
  $("pause-screen").classList.add("hidden");
  state.mode = "play";
  setDrone(settings.sfx);
  recoverAudio();
}

function quitToTitle() {
  clearTimeout(introTimer);
  setNight(false); // the title screen is always daytime
  saveCheckpoint();
  $("pause-screen").classList.add("hidden");
  $("end-screen").classList.add("hidden");
  $("hud").classList.add("hidden");
  $("touch").classList.add("hidden");
  document.body.classList.add("gate");
  $("title-screen").classList.remove("hidden");
  $("btn-start").disabled = false;
  $("btn-start").textContent = startBtnLabel();
  state.mode = "title";
  setDrone(false);
  stopVoice();
  stopSiteRadio();
  refreshTitle();
  refreshTitlePreview();
}

for (const [id, fn] of [
  ["btn-pause", pauseGame],
  ["btn-resume", resumeGame],
  ["btn-real-fund", openRealFund],
  ["btn-real-fund-pause", openRealFund],
  ["btn-quit", quitToTitle],
  ["btn-gate", quitToTitle],
]) {
  const el = $(id);
  if (el) el.addEventListener("click", fn);
}

function bindToggle(id, key) {
  const b = $(id);
  if (!b) return;
  const paint = () => {
    b.classList.toggle("on", !!settings[key]);
    b.textContent = settings[key] ? "ON" : "OFF";
  };
  paint();
  b.addEventListener("click", () => {
    settings[key] = !settings[key];
    if (key === "swap") $("touch")?.classList.toggle("swap", settings.swap);
    if (key === "sfx") {
      setDrone(settings.sfx && state.mode === "play");
      if (!settings.sfx && SITE_RADIO.gain) SITE_RADIO.gain.gain.value = 0;
    }
    if (key === "voice" && !settings.voice) stopVoice();
    if (key === "mp" && !settings.mp) clearGhosts();
    if (key === "mp" && settings.mp) pullPresence();
    saveSettings();
    paint();
  });
}
try {
  bindToggle("set-sfx", "sfx");
  bindToggle("set-voice", "voice");
  bindToggle("set-swap", "swap");
  bindToggle("set-mp", "mp");
} catch (err) {
  console.warn("[LW] settings bind", err);
}

const SENS = { "set-sens-lo": 0.6, "set-sens-md": 1, "set-sens-hi": 1.5 };
function paintSens() {
  for (const id of Object.keys(SENS)) {
    const el = $(id);
    if (el) el.classList.toggle("on", settings.sens === SENS[id]);
  }
}
for (const id of Object.keys(SENS)) {
  const el = $(id);
  if (!el) continue;
  el.addEventListener("click", () => {
    settings.sens = SENS[id];
    saveSettings();
    paintSens();
  });
}
paintSens();
$("touch")?.classList.toggle("swap", settings.swap);

/* ------------------------------------------------------------------ */
/*  LIFECYCLE (backgrounding, wake lock, fullscreen)                   */
/* ------------------------------------------------------------------ */
let wakeLock = null;
async function acquireWakeLock() {
  try {
    wakeLock = await navigator.wakeLock?.request("screen");
  } catch (_) {}
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (state.mode === "play") pauseGame();
    else if (["panel", "facp", "mag", "trouble", "pull"].includes(state.mode)) {
      pull.holding = false; // a backgrounded thumb is not pulling cable
      saveCheckpoint();
    }
    audio.ctx?.suspend?.().catch?.(() => {});
    stopVoice();
  } else {
    recoverAudio();
    acquireWakeLock();
  }
});

const IS_IOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
function goImmersive() {
  acquireWakeLock();
  unzoomIfNeeded();
  applySize();
  // iOS Safari has no fullscreen for canvas pages; Android benefits from it
  if (isCoarse() && !IS_IOS) document.documentElement.requestFullscreen?.().catch?.(() => {});
}

/* ------------------------------------------------------------------ */
/*  BOOT                                                               */
/* ------------------------------------------------------------------ */
let pickedDay = 1;

function startBtnLabel() {
  if (pickedDay === 1) return "START · GET YOUR POUCH";
  const w = weekOfDay(pickedDay);
  return "START D" + pickedDay + " · " + dayDisplayName(pickedDay) + (w > 1 ? " · WEEK " + w : "");
}

let gateWeek = currentContractWeek();

function fillDayPicker() {
  const picker = $("day-picker");
  if (!picker) return;
  let weekBar = $("week-picker");
  if (!weekBar) {
    weekBar = document.createElement("div");
    weekBar.id = "week-picker";
    weekBar.className = "week-picker";
    picker.parentNode.insertBefore(weekBar, picker);
  }
  const weeksOpen = Math.max(1, Math.ceil(LAST_DAY / 7));
  if (gateWeek > weeksOpen) gateWeek = weeksOpen;
  if (gateWeek < 1) gateWeek = 1;
  weekBar.textContent = "";
  for (let w = 1; w <= weeksOpen; w++) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "day-chip week-chip" + (w === gateWeek ? " on" : "");
    b.textContent = "WEEK " + w + " · " + weekRangeLabel(w);
    b.addEventListener("click", () => {
      gateWeek = w;
      const lo = (w - 1) * 7 + 1;
      if (pickedDay < lo || pickedDay > lo + 6) pickedDay = lo;
      fillDayPicker();
      refreshBestLine();
      $("btn-start").textContent = startBtnLabel();
    });
    weekBar.appendChild(b);
  }
  picker.textContent = "";
  const u = unlockedDays();
  const lo = (gateWeek - 1) * 7 + 1;
  const hi = Math.min(LAST_DAY, lo + 6);
  if (pickedDay > u) pickedDay = u;
  if (pickedDay < 1) pickedDay = 1;
  if (pickedDay < lo || pickedDay > hi) pickedDay = Math.min(u, lo);
  try {
    window.__lwPicked = pickedDay;
  } catch (_) {}
  for (let d = lo; d <= hi; d++) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "day-chip" + (d === pickedDay ? " on" : "");
    b.setAttribute("data-day", String(d));
    if (d <= u) {
      b.textContent = "D" + d + " · " + dayDisplayName(d);
      b.addEventListener("click", () => {
        pickedDay = d;
        try {
          window.__lwPicked = d;
        } catch (_) {}
        fillDayPicker();
        refreshBestLine();
        $("btn-start").textContent = startBtnLabel();
      });
    } else {
      b.textContent = "🔒 D" + d;
      b.disabled = true;
    }
    picker.appendChild(b);
  }
}

function refreshBestLine() {
  const who = getTraveler();
  const best = loadBest(pickedDay, who);
  const bl = $("title-best");
  if (best) {
    bl.innerHTML = `${travelerTag(who)} · DAY ${pickedDay} RECORD: <strong>${best.watts.toLocaleString()} PTS${best.time ? " · " + best.time : ""} · ${best.rank}</strong>`;
    bl.classList.remove("hidden");
  } else {
    bl.classList.add("hidden");
  }
}

function refreshTitle() {
  refreshBestLine();
  fillDayPicker();
  let newest = null;
  for (let d = 1; d <= LAST_DAY; d++) {
    const s = loadCheckpoint(d);
    if (s && (!newest || (s.ts || 0) > (newest.ts || 0))) newest = s;
  }
  const rb = $("btn-resume-save");
  rb.classList.toggle("hidden", !newest);
  if (newest) {
    rb.textContent = "BACK ON THE HALL · DAY " + (newest.day || 1);
    rb.dataset.day = String(newest.day || 1);
  }
  refreshTitleBoard();
}

/* the site board lives right on the gate — no button required */
function peopleFromSlots(rows) {
  const people = [];
  for (let i = 0; i < (rows || []).length; ) {
    const a = rows[i];
    const b = rows[i + 1];
    if (!a) break;
    const pair = b && careerKey(a.name, a.local) === careerKey(b.name, b.local);
    const utah = (pair ? (a.who === "tremont" ? b : a) : a.who === "tremont" ? emptyCrew(a.name, a.local, "utah") : a);
    const tremont = (pair ? (a.who === "tremont" ? a : b) : a.who === "tremont" ? a : emptyCrew(a.name, a.local, "tremont"));
    people.push({ name: a.name, local: a.local || "", utah, tremont });
    i += pair ? 2 : 1;
  }
  return people;
}

function boardTimeText(r) {
  const sec = Number(r && r.seconds) || 0;
  const pts = Number(r && r.pts) || 0;
  // Walk-on / no finish: never paint a fake 0:00 clock
  if (sec <= 0) return "—";
  if (pts <= 0 && !(r && r.rank && r.rank !== "—" && r.rank !== "ON SITE")) return "—";
  return formatTime(sec);
}

function crewCell(r) {
  const pts = Number(r && r.pts) || 0;
  const sec = Number(r && r.seconds) || 0;
  const rk = rankShort(r && r.rank);
  const played = pts > 0 || sec > 0 || (rk && rk !== "—" && rk !== "ON SITE");
  if (!played && !(r && r.rank === "ON SITE")) return "—";
  if (pts <= 0 && sec <= 0) {
    return rk && rk !== "—" ? rk : "—";
  }
  const bits = [pts.toLocaleString()];
  if (sec > 0) bits.push(formatTime(sec));
  if (rk && rk !== "—") bits.push(rk);
  return bits.join(" · ");
}

function renderTitleTop5(el, rows) {
  el.textContent = "";
  if (boardNote) {
    const n = document.createElement("div");
    n.className = "board-note";
    n.textContent = boardNote;
    el.appendChild(n);
  }
  const people = peopleFromSlots(rows).slice(0, 5);
  if (!people.length) {
    const d = document.createElement("div");
    d.className = "board-note";
    d.textContent = "Board's empty. First loop landed takes the top slot.";
    el.appendChild(d);
    return;
  }
  const hdr = document.createElement("div");
  hdr.className = "board-row hdr title5-hdr";
  for (const [cls, txt] of [
    ["b-pos", "#"],
    ["b-name", "NAME"],
    ["b-utah", "UTAH"],
    ["b-trem", "TREMONT"],
  ]) {
    const s = document.createElement("span");
    s.className = cls;
    s.textContent = txt;
    hdr.appendChild(s);
  }
  el.appendChild(hdr);
  people.forEach((p, i) => {
    const row = document.createElement("div");
    row.className = "board-row title5" + (i === 0 ? " lead" : "");
    const pos = document.createElement("span");
    pos.className = "b-pos";
    pos.textContent = String(i + 1);
    const name = document.createElement("span");
    name.className = "b-name";
    name.textContent = p.name || "?";
    if (p.local) {
      const loc = document.createElement("span");
      loc.className = "b-loc";
      loc.textContent = p.local;
      name.appendChild(loc);
    }
    const utah = document.createElement("span");
    utah.className = "b-utah";
    utah.textContent = crewCell(p.utah || emptyCrew(p.name, p.local, "utah"));
    const trem = document.createElement("span");
    trem.className = "b-trem";
    trem.textContent = crewCell(p.tremont || emptyCrew(p.name, p.local, "tremont"));
    row.append(pos, name, utah, trem);
    el.appendChild(row);
  });
}

async function refreshTitleBoard() {
  const el = $("title-board");
  if (!el) return;
  try {
    const rows = await fetchBoard(true);
    const cw = currentContractWeek();
    const weeked = rows.map((r) => weekBestOf(r, cw)).filter((r) => r && ((r.pts || 0) > 0 || (r.rank && r.rank !== "ON SITE")));
    renderTitleTop5(el, weeked.length ? crewSlots(weeked) : rows);
  } catch (_) {
    el.textContent = "";
    const d = document.createElement("div");
    d.className = "board-note";
    d.textContent = "Board's down — no signal at the gate.";
    el.appendChild(d);
  }
}

function hideOverlays() {
  for (const id of ["panel-game", "facp-game", "mag-game", "trouble-game", "pull-game", "board-screen", "store-screen", "shop-screen", "pause-screen", "print-view", "chat-dock"]) {
    $(id)?.classList.add("hidden");
  }
}

function hidePlayChrome() {
  hideOverlays();
  $("touch").classList.add("hidden");
  resetTransientInput();
  if ($("heat-veil")) $("heat-veil").style.opacity = "0";
  if ($("heat-meter")) $("heat-meter").classList.add("hidden");
}

function showPlayUI() {
  document.body.classList.remove("gate");
  $("title-screen").classList.add("hidden");
  disposeTitlePreview();
  $("end-screen").classList.add("hidden");
  hideOverlays();
  $("hud").classList.remove("hidden");
  if (isCoarse()) $("touch").classList.remove("hidden");
  setHearts();
  refreshJobs();
}

function teachTouch() {
  if (!isCoarse()) return;
  let seen = null;
  try {
    seen = localStorage.getItem("lw_tut");
  } catch (_) {}
  if (seen) return;
  try {
    localStorage.setItem("lw_tut", "1");
  } catch (_) {}
  setTimeout(() => toast("LEFT THUMB — WALK"), 1600);
  setTimeout(() => toast("RIGHT THUMB — LOOK"), 3600);
  setTimeout(() => toast("STICK TO THE EDGE = HUSTLE"), 5800);
}

let starting = false;
let lastStartAt = 0;
let introTimer = 0;

function gateError(msg, el) {
  const err = $("gate-err");
  if (err) {
    err.textContent = msg;
    err.classList.remove("hidden");
  }
  toast(msg, true);
  try {
    el?.focus();
  } catch (_) {}
}

function clearGateError() {
  $("gate-err")?.classList.add("hidden");
}

async function startShift(resume, wantDay = 1) {
  if (starting) return; // double-tap during the async build must not re-enter
  // the gate button has two click listeners (game.js + index.html shim); the
  // second fires after the sync path has already finished, so guard by time too
  if (Date.now() - lastStartAt < 600) return;
  lastStartAt = Date.now();
  if (!commitHand(true)) {
    gateError("NAME GOES ON THE SLIP", $("gate-name"));
    return;
  }
  claimVisitor(commitHand(false)).catch(() => {});
  // Prefer the gate chip if the caller forgot (old shell used __lwPicked)
  let want = Number(wantDay);
  if (!Number.isFinite(want) || want < 1) want = pickedDay || 1;
  const u = unlockedDays();
  if (want > u) want = u;
  if (want < 1) want = 1;
  wantDay = want;
  pickedDay = wantDay;
  try {
    window.__lwPicked = wantDay;
  } catch (_) {}
  registerWalkOn(wantDay); // name hits the board now — both crews, zeros until they land work
  starting = true;
  clearGateError();
  paintWhoName();
  netBeat();
  resumeAudio();
  primeVoice();
  bootTTS();
  loadSiteRadio();
  const intro = dayStartLines(wantDay);
  prefetchLine(foremanWho(), intro[0]);
  if (intro[1]) prefetchLine(foremanWho(), intro[1]);
  goImmersive();
  $("btn-start").disabled = true;
  $("btn-resume-save").disabled = true;
  $("btn-start").textContent = "STARTING SHIFT…";
  if (!state.built) {
    try {
      await buildWorld();
      const stat = mergeStaticWorld();
      console.info("[LW] static merge:", stat);
    } catch (err) {
      console.error(err);
      starting = false;
      $("btn-start").disabled = false;
      $("btn-resume-save").disabled = false;
      $("btn-start").textContent = startBtnLabel();
      gateError("SITE TRAILER WIFI DIED — TAP AGAIN", $("btn-start"));
      return;
    }
  }
  let save = resume ? loadCheckpoint(wantDay) : null;
  if (save) {
    setDay(save.day || 1);
    state.seed = save.seed || 1;
  } else {
    setDay(wantDay);
    state.seed = (Math.random() * 1e9) | 0;
  }
  softReset(); // builds the day's item list (seeded) and resets the world
  if (save && (save.n !== state.interactables.length || (save.doneIdx || []).some((i) => i >= state.interactables.length))) {
    save = null; // layout drift — a stale save must not corrupt a fresh world
  }
  showPlayUI();
  if (save) applyCheckpoint(save);
  state.mode = "play";
  startSiteRadio();
  setDrone(settings.sfx);
  netBeat();
  pullPresence();
  track("shift_start", { resume: save ? "yes" : "no", touch: isCoarse() ? "yes" : "no" });
  clearTimeout(introTimer);
  for (const l of dayStartLines(day)) prefetchLine(foremanWho(), l); // warm the opening clips
  if (save) {
    saveCheckpoint(); // re-persist — softReset cleared the stored copy
    radioFore(
      "Back on it, Utah. Loop's where you left it.",
      "Back on it, Tremont. Work's where you left it."
    );
  } else {
    const lines = dayStartLines(day);
    radio(lines[0]);
    const openerBaked = voice.map && voice.map[foremanWho() + "|" + lines[0]];
    introTimer = setTimeout(() => {
      if (state.mode === "play" && lines[1]) radio(lines[1]);
    }, openerBaked ? 12000 : 5400); // the neural openers run 9-14s — don't chop them
    if (cycleDay(day) === 1) teachTouch();
  }
  starting = false;
  $("btn-start").disabled = false;
  $("btn-resume-save").disabled = false;
  $("btn-start").textContent = startBtnLabel();
}

window.LW = window.LW || {};
window.LW.startShift = startShift;
window.LW.getPickedDay = () => pickedDay;


function applyTravelerUI() {
  const t = getTraveler();
  document.querySelectorAll(".trav-btn").forEach((b) => {
    b.classList.toggle("on", b.dataset.traveler === t);
  });
  const img = $("title-utah");
  if (img) {
    img.src = t === "tremont" ? "assets/tremont_title.jpg" : "assets/utah_title.jpg";
    img.alt = t === "tremont" ? "Tremont" : "Utah";
  }
  const pic = $("portrait");
  if (pic) {
    pic.src = t === "tremont" ? "assets/tremont_portrait.jpg" : "assets/utah_portrait.jpg";
    pic.alt = t === "tremont" ? "Tremont" : "Utah";
  }
  paintRadioFace(t === "tremont" ? "lemon" : "lugo");
  const whoEl = document.querySelector(".who-name");
  if (whoEl) paintWhoName();
  const sub = document.querySelector("#title-screen .sub");
  if (sub) sub.textContent = t === "tremont" ? "Lake Mariner · Power" : "Lake Mariner · Fire Alarm";
  const blurb = document.querySelector("#title-screen .blurb");
  if (blurb) {
    blurb.innerHTML =
      t === "tremont"
        ? "Tremont, Book 2 traveler — 237's call at Lake Mariner. His foreman is <strong>Lemon</strong>. Seven days on the power: lighting, feeders, EMT, gear, then energize. Drag it and Drew comes off the trailer with a slip."
        : "Utah, Book 2 traveler, O'Connell Electric — 237's call at Lake Mariner. Seven days on the fire alarm: rough-in, trim, the AHJ walk, a night shift on the genny, the big pull, Drew's punch list, and energize day. Drag any of it and Drew comes off the trailer with a slip.";
  }
  try {
    rebuildPlayerBody();
  } catch (err) {
    console.warn("[LW] player mesh", err);
  }
  if (state.candyBag) state.candyBag.visible = getTraveler() !== "tremont";
  fillDayPicker();
  refreshBestLine();
  const startBtn = $("btn-start");
  if (startBtn && state.mode === "title") startBtn.textContent = startBtnLabel();
  refreshTitlePreview();
}
document.querySelectorAll(".trav-btn").forEach((b) => {
  b.addEventListener("click", () => {
    const before = getTraveler();
    setTraveler(b.dataset.traveler);
    if (state.built && getTraveler() !== before) {
      // the merged world is traveler-specific (VESDAs, FA devices, conduit);
      // it can't be un-baked, so a swap after building needs a fresh page —
      // otherwise Utah's Day 1/8 VESDA jobs are unwinnable in a Tremont world
      toast("SWAPPING TRAVELERS — RESETTING THE HALL");
      setTimeout(() => {
        try { location.reload(); } catch (_) {}
      }, 400);
      return;
    }
    try {
      applyTravelerUI();
    } catch (err) {
      console.warn("[LW] traveler ui", err);
      fillDayPicker();
    }
    sfx("pickup");
  });
});

$("btn-start").onclick = () => startShift(false, pickedDay);
$("btn-resume-save").onclick = () => startShift(true, Number($("btn-resume-save").dataset.day) || pickedDay);
$("btn-next-day").onclick = () => startShift(false, Math.min(LAST_DAY, day + 1));

$("btn-again").onclick = () => {
  state.seed = (Math.random() * 1e9) | 0; // fresh trouble picks every rerun
  unzoomIfNeeded();
  applySize();
  softReset();
  showPlayUI();
  state.mode = "play";
  setDrone(settings.sfx);
  track("shift_start", { resume: "no", rerun: "yes", day, touch: isCoarse() ? "yes" : "no" });
  const lines = dayStartLines(day);
  radio(cycleDay(day) === 2
    ? (isTremont()
        ? "Day two again. Meg the feeders, chase the opens, walk my gear."
        : "Day two again. Mag the smokes, chase my troubles, walk the panel.")
    : lines[0]);
};

/* site board wiring */
let scorePosted = false;
let lastWinRec = null;

function winRec(name, local, rank) {
  return {
    name,
    local,
    pts: ptsNum(state.watts),
    seconds: Math.round(Math.max(0, shiftLen - state.time + state.overtime)),
    rank: rank || rankName(),
    day,
    level: day,
    who: getTraveler(),
  };
}

function failRank(reason) {
  if (reason === "inspection") return "RED TAG";
  if (reason === "slip") return "SLIP";
  if (reason === "heat") return "HEAT";
  return "OT";
}

function registerWalkOn(wantDay) {
  const name = commitHand(true);
  if (!name) return;
  const rec = {
    name,
    local: readGateLocal(),
    pts: 0,
    seconds: 0,
    rank: "ON SITE",
    day: wantDay || day || 1,
    level: wantDay || day || 1,
    who: getTraveler(),
    started: true,
  };
  postScore(rec).catch(() => {});
}

function postProgress(rank) {
  const name = commitHand(false);
  if (!name) return;
  const rec = winRec(name, readGateLocal(), rank);
  rec.started = true;
  postScore(rec).then(() => paintMiniBoard()).catch(() => {});
}

async function paintMiniBoard() {
  try {
    renderBoard($("board-mini"), (await fetchBoard(true)).slice(0, 16));
  } catch (_) {}
}

async function autoPostWin(posted) {
  const rec = posted || lastWinRec || winRec(commitHand(false) || "", readGateLocal());
  const name = (rec.name || commitHand(false) || ($("post-name") && $("post-name").value) || "").trim().toUpperCase().slice(0, 20);
  const local = (rec.local || readGateLocal() || ($("post-local") && $("post-local").value) || "").trim().toUpperCase().slice(0, 8);
  if (!name) {
    await paintMiniBoard();
    return;
  }
  rec.name = name;
  rec.local = local;
  lastWinRec = rec;
  if ($("post-name")) $("post-name").value = name;
  if ($("post-local")) $("post-local").value = local;
  const result = await postScore(rec);
  scorePosted = !result.down;
  try {
    durableSet("lw_name", name);
    durableSet("lw_local", local);
  } catch (_) {}
  track("board_post", {
    pts: rec.pts,
    local,
    who: rec.who,
    day: rec.day,
    auto: "yes",
    kept: result.kept ? "yes" : "no",
    down: result.down ? "yes" : "no",
  });
  if (!result.down) $("post-score").classList.add("hidden");
  toast(
    result.down
      ? "GATE MISSED THE POST — TAP POST IT"
      : result.kept
        ? "BOARD ALREADY HAS YOUR BEST"
        : "POSTED TO THE CLOUD BOARD"
  );
  await paintMiniBoard();
}

$("btn-post").addEventListener("click", async () => {
  if (scorePosted) return;
  const name = $("post-name").value.trim().toUpperCase().slice(0, 20);
  const local = $("post-local").value.trim().toUpperCase().slice(0, 8);
  if (!name) {
    toast("NAME GOES ON THE BOARD", true);
    $("post-name").focus();
    return;
  }
  const btn = $("btn-post");
  btn.disabled = true;
  btn.textContent = "POSTING…";
  const rec = lastWinRec
    ? { ...lastWinRec, name, local }
    : winRec(name, local);
  const result = await postScore(rec);
  scorePosted = true;
  try {
    durableSet("lw_name", name);
    durableSet("lw_local", local);
  } catch (_) {}
  track("board_post", { pts: state.watts, local, who: getTraveler(), kept: result.kept ? "yes" : "no", down: result.down ? "yes" : "no" });
  $("post-score").classList.add("hidden");
  toast(
    result.down
      ? "ON THIS BOX — GATE'S JAMMED, WILL POST WHEN IT CLEARS"
      : result.kept
        ? "BOARD ALREADY HAS YOUR BEST"
        : "POSTED TO THE BOARD"
  );
  await paintMiniBoard();
  if (result.down) {
    btn.disabled = false;
    btn.textContent = "POST IT";
    scorePosted = false;
    $("post-score").classList.remove("hidden");
  }
});

let boardRows = [];
let boardFilter = 0; // 0 = all days
let boardWho = 0; // 0 = all travelers
let boardWeek = currentContractWeek(); // 0 = career (all weeks)

function weekBestOf(r, w) {
  if (!w) return r;
  const lo = (w - 1) * 7 + 1;
  const hi = w * 7;
  const scores = r.dayScores || {};
  let best = null;
  let total = 0;
  let level = 0;
  for (let d = lo; d <= hi; d++) {
    const s = scores[d];
    if (!s) continue;
    const p = ptsNum(s.pts);
    if (p > 0) total += p;
    if (p > 0 || s.rank) level = Math.max(level, d);
    if (!best || betterRun({ pts: p, seconds: s.seconds || 0 }, best)) {
      best = { pts: p, seconds: s.seconds || 0, rank: s.rank || "", day: d };
    }
  }
  if (!best && (r.day || 0) >= lo && (r.day || 0) <= hi) {
    best = { pts: r.pts || 0, seconds: r.seconds || 0, rank: r.rank || "", day: r.day };
    total = best.pts;
    level = r.level || r.day || 0;
  }
  if (!best) return null;
  return { ...r, pts: best.pts, seconds: best.seconds, rank: best.rank, day: best.day, level: level || r.level, total: total || best.pts };
}

function renderBoardFiltered() {
  let rows = boardRows;
  if (boardWho) rows = rows.filter((r) => (r.who || "utah") === boardWho);
  if (boardWeek) {
    rows = rows.map((r) => weekBestOf(r, boardWeek)).filter(Boolean);
    rows.sort((a, b) => (b.pts || 0) - (a.pts || 0) || (a.seconds || 9e9) - (b.seconds || 9e9));
  }
  renderBoard($("board-list"), rows);
  const el = $("board-list");
  if (el && rows.length) {
    const names = new Set(rows.map((r) => String(r.name || "").toUpperCase()).filter(Boolean));
    const foot = document.createElement("div");
    foot.className = "board-note";
    const wk = boardWeek ? "WEEK " + boardWeek + " · " + weekRangeLabel(boardWeek) : "CAREER · ALL WEEKS";
    foot.textContent = rows.length + " ROWS · " + names.size + " HANDS · " + wk;
    el.appendChild(foot);
  }
}

(() => {
  const whoTabs = $("board-who-tabs") || document.querySelector(".board-tabs");
  const dayTabs = $("board-day-tabs");
  if (whoTabs) {
    whoTabs.textContent = "";
    const whoDefs = [
      ["ALL", 0],
      ["UTAH", "utah"],
      ["TREMONT", "tremont"],
    ];
    for (const [label, v] of whoDefs) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "set-btn" + (v === 0 ? " on" : "");
      b.textContent = label;
      b.addEventListener("click", () => {
        boardWho = v;
        [...whoTabs.children].forEach((el, i) => el.classList.toggle("on", whoDefs[i][1] === v));
        renderBoardFiltered();
      });
      whoTabs.appendChild(b);
    }
  }
  if (dayTabs) {
    dayTabs.classList.remove("hidden");
    dayTabs.textContent = "";
    const weeksOpen = Math.max(1, Math.ceil(LAST_DAY / 7));
    const defs = [["CAREER", 0]];
    for (let w = 1; w <= weeksOpen; w++) defs.push(["WEEK " + w, w]);
    for (const [label, v] of defs) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "set-btn" + (v === boardWeek ? " on" : "");
      b.textContent = label;
      b.addEventListener("click", () => {
        boardWeek = v;
        [...dayTabs.children].forEach((el, i) => el.classList.toggle("on", defs[i][1] === v));
        renderBoardFiltered();
      });
      dayTabs.appendChild(b);
    }
  }
})();


/* ------------------------------------------------------------------ */
/*  ADD TO THE GAME — player request bench                             */
/*  Shipped work is listed in public/shop-ledger.json. Do not rebuild. */
/* ------------------------------------------------------------------ */
const TICKET_PREFIX = "[TICKET] ";
const SHOP_COOL_MS = 8000;
const SHOP_MAX_PHOTO = 2;
const SHOP_MAX_CLIP = 2;
const SHOP_MAX_CLIP_BYTES = 2800000;
const SHOP_BUCKET = "livewire-lakemariner.firebasestorage.app";
let shopSending = false;
let shopCache = [];
let shopPending = { photos: [], clips: [] };

function shopLastAt() {
  try { return Number(localStorage.getItem("lw_shop_last") || 0) || 0; } catch (_) { return 0; }
}
function shopMarkSent() {
  try { localStorage.setItem("lw_shop_last", String(Date.now())); } catch (_) {}
}
function shopSeenAt() {
  try { return Number(localStorage.getItem("lw_shop_seen") || 0) || 0; } catch (_) { return 0; }
}
function shopMarkSeen() {
  try { localStorage.setItem("lw_shop_seen", String(Date.now())); } catch (_) {}
}

function isTicketText(t) {
  return String(t || "").startsWith(TICKET_PREFIX);
}
function ticketBody(t) {
  const s = String(t || "");
  return isTicketText(s) ? s.slice(TICKET_PREFIX.length) : s;
}

function bufToB64(buf) {
  const bytes = new Uint8Array(buf);
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

function shopFileExt(f) {
  if (f.kind === "photo") return ".jpg";
  const m = String(f.mime || "") + " " + String(f.name || "");
  if (/m4a|mp4|aac/i.test(m)) return ".m4a";
  if (/wav/i.test(m)) return ".wav";
  if (/ogg/i.test(m)) return ".ogg";
  return ".mp3";
}

async function uploadShopBlob(path, blob, mime, meta) {
  const url =
    "https://storage.googleapis.com/upload/storage/v1/b/" +
    SHOP_BUCKET +
    "/o?uploadType=media&name=" +
    encodeURIComponent(path);
  const headers = { "Content-Type": mime || (blob && blob.type) || "application/octet-stream" };
  if (meta && meta.owner) headers["x-goog-meta-owner"] = String(meta.owner).slice(0, 24);
  if (meta && meta.pack) headers["x-goog-meta-pack"] = String(meta.pack).slice(0, 40);
  const r = await fetch(url, { method: "POST", headers, body: blob });
  if (!r.ok) throw new Error("storage " + r.status);
  return "https://storage.googleapis.com/" + SHOP_BUCKET + "/" + path;
}

function shopOwnerSlug(name) {
  const s = String(name || "ANON").toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 16);
  return s || "ANON";
}

function fsStrings(f) {
  const vals = f && f.arrayValue && f.arrayValue.values;
  if (!vals) return [];
  return vals.map((v) => (v && v.stringValue) || "").filter(Boolean);
}

function compressShopPhoto(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const max = 720;
      let w = img.naturalWidth || 1;
      let h = img.naturalHeight || 1;
      if (w > max || h > max) {
        const s = max / Math.max(w, h);
        w = Math.round(w * s);
        h = Math.round(h * s);
      }
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      const data = c.toDataURL("image/jpeg", 0.72);
      const b64 = data.split(",")[1] || "";
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      resolve({
        kind: "photo",
        name: String(file.name || "photo.jpg").slice(0, 80),
        mime: "image/jpeg",
        blob: new Blob([arr], { type: "image/jpeg" }),
        preview: data,
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read that photo. Try a JPEG or PNG."));
    };
    img.src = url;
  });
}

async function readShopClip(file, kind) {
  const raw = await file.arrayBuffer();
  if (raw.byteLength < 800) throw new Error("That clip is empty.");
  if (raw.byteLength > SHOP_MAX_CLIP_BYTES) {
    throw new Error("Clip is too long — keep it under ~2 minutes of MP3 (voice line or a sting, not an album).");
  }
  const mime = String(file.type || "audio/mpeg").slice(0, 60) || "audio/mpeg";
  const blob = new Blob([raw], { type: mime });
  return {
    kind: kind === "music" ? "music" : "voice",
    name: String(file.name || (kind === "music" ? "sting.mp3" : "line.mp3")).slice(0, 80),
    mime,
    blob,
    preview: URL.createObjectURL(blob),
  };
}

function paintShopPending() {
  const el = $("shop-att-preview");
  if (!el) return;
  el.textContent = "";
  const all = shopPending.photos.concat(shopPending.clips);
  all.forEach((f) => {
    const card = document.createElement("div");
    card.className = "shop-att-card";
    if (f.kind === "photo" && f.preview) {
      const img = document.createElement("img");
      img.src = f.preview;
      img.alt = f.name;
      card.appendChild(img);
    } else if (f.preview) {
      const au = document.createElement("audio");
      au.controls = true;
      au.preload = "metadata";
      au.src = f.preview;
      card.appendChild(au);
    }
    const nm = document.createElement("div");
    nm.className = "att-name";
    nm.textContent = (f.kind === "music" ? "MUSIC · " : f.kind === "voice" ? "VOICE · " : "") + (f.name || f.kind);
    card.appendChild(nm);
    const x = document.createElement("button");
    x.type = "button";
    x.className = "att-x";
    x.textContent = "×";
    x.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      shopPending.photos = shopPending.photos.filter((p) => p !== f);
      shopPending.clips = shopPending.clips.filter((p) => p !== f);
      paintShopPending();
    });
    card.appendChild(x);
    el.appendChild(card);
  });
}

async function addShopPhotos(list) {
  const st = $("shop-status");
  for (const file of list) {
    if (shopPending.photos.length >= SHOP_MAX_PHOTO) {
      if (st) { st.classList.remove("hidden"); st.classList.add("err"); st.textContent = "Two photos max."; }
      break;
    }
    try {
      shopPending.photos.push(await compressShopPhoto(file));
    } catch (err) {
      if (st) { st.classList.remove("hidden"); st.classList.add("err"); st.textContent = err.message || "Photo failed."; }
    }
  }
  paintShopPending();
}

async function addShopClips(list, kind) {
  const st = $("shop-status");
  for (const file of list) {
    if (shopPending.clips.length >= SHOP_MAX_CLIP) {
      if (st) { st.classList.remove("hidden"); st.classList.add("err"); st.textContent = "Two clips max."; }
      break;
    }
    try {
      shopPending.clips.push(await readShopClip(file, kind));
    } catch (err) {
      if (st) { st.classList.remove("hidden"); st.classList.add("err"); st.textContent = err.message || "Clip failed."; }
    }
  }
  paintShopPending();
}

function parseShopDoc(doc) {
  if (!doc || !doc.fields) return null;
  const f = doc.fields;
  const text = ticketBody(String(fsVal(f.text) || "")).trim();
  if (!text) return null;
  const created = fsVal(f.ts) || (doc.createTime && Date.parse(doc.createTime)) || 0;
  const status = String(fsVal(f.status) || "new").toLowerCase() === "done" ? "done" : "new";
  return {
    id: String(doc.name || "").split("/").pop() || "",
    text: text.slice(0, 500),
    name: String(fsVal(f.name) || "ANON").slice(0, 20),
    who: fsVal(f.who) === "tremont" ? "tremont" : "utah",
    createdAt: created || 0,
    status,
    pack: String(fsVal(f.pack) || ""),
    photoN: Number(fsVal(f.photoN) || 0) || fsStrings(f.photoUrls).length,
    clipN: Number(fsVal(f.clipN) || 0) || fsStrings(f.clipUrls).length,
    photoUrls: fsStrings(f.photoUrls),
    clipUrls: fsStrings(f.clipUrls),
  };
}

async function fetchShopTickets() {
  try {
    let docs = [];
    try { docs = await fsList("tickets", 80); } catch (_) { docs = []; }
    const rows = [];
    for (const d of docs) {
      const row = parseShopDoc(d);
      if (row) rows.push(row);
    }
    rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    shopCache = rows;
    return rows;
  } catch (_) {
    return shopCache.slice();
  }
}

function formatShopWhen(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (!Number.isFinite(d.getTime())) return "";
  try {
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch (_) {
    return "";
  }
}

function renderShopList(rows) {
  const el = $("shop-list");
  if (!el) return;
  el.textContent = "";
  if (!rows || !rows.length) {
    const d = document.createElement("div");
    d.className = "board-note";
    d.textContent = "No requests yet. First one lands here.";
    el.appendChild(d);
    return;
  }
  const open = rows.filter((r) => r.status !== "done");
  const done = rows.filter((r) => r.status === "done");
  const seen = shopSeenAt();

  function addCard(r) {
    const card = document.createElement("div");
    const isNew = r.status !== "done" && (r.createdAt || 0) > seen;
    card.className = "shop-ticket" + (r.status === "done" ? " done" : "") + (isNew ? " new" : "");
    const meta = document.createElement("div");
    meta.className = "st-meta";
    meta.textContent =
      (r.status === "done" ? "ADDED · " : "") +
      (r.name || "ANON") +
      " · " +
      (r.who === "tremont" ? "TREMONT" : "UTAH") +
      (r.createdAt ? " · " + formatShopWhen(r.createdAt) : "");
    const body = document.createElement("div");
    body.className = "st-text";
    body.textContent = (r.status === "done" ? "✓ " : "") + r.text;
    card.append(meta, body);
    if (r.photoN || r.clipN || (r.photoUrls && r.photoUrls.length)) {
      const att = document.createElement("div");
      att.className = "st-att";
      (r.photoUrls || []).slice(0, 2).forEach((u) => {
        const img = document.createElement("img");
        img.src = u;
        img.alt = "ref";
        img.style.cssText = "width:56px;height:56px;object-fit:cover;border:1px solid #3a4030";
        att.appendChild(img);
      });
      if (r.photoN && !(r.photoUrls && r.photoUrls.length)) {
        const c = document.createElement("span");
        c.className = "st-chip";
        c.textContent = r.photoN === 1 ? "PHOTO" : r.photoN + " PHOTOS";
        att.appendChild(c);
      }
      if (r.clipN) {
        const c = document.createElement("span");
        c.className = "st-chip";
        c.textContent = r.clipN === 1 ? "AUDIO" : r.clipN + " CLIPS";
        att.appendChild(c);
      }
      (r.clipUrls || []).slice(0, 2).forEach((u) => {
        const a = document.createElement("audio");
        a.controls = true;
        a.preload = "none";
        a.src = u;
        a.style.cssText = "width:140px;height:28px";
        att.appendChild(a);
      });
      card.appendChild(att);
    }
    el.appendChild(card);
  }

  if (open.length) {
    const h = document.createElement("div");
    h.className = "shop-sec";
    h.textContent = "OPEN";
    el.appendChild(h);
    open.slice(0, 30).forEach(addCard);
  } else {
    const d = document.createElement("div");
    d.className = "board-note";
    d.textContent = "No open requests. Bench is clear.";
    el.appendChild(d);
  }
  if (done.length) {
    const h = document.createElement("div");
    h.className = "shop-sec";
    h.textContent = "ADDED";
    el.appendChild(h);
    done.slice(0, 30).forEach(addCard);
  }
}

function paintShopBadge(rows) {
  const btn = $("btn-shop");
  if (!btn) return;
  const seen = shopSeenAt();
  const n = (rows || []).filter((r) => r.status !== "done" && (r.createdAt || 0) > seen).length;
  btn.classList.toggle("has-new", n > 0);
  let main = btn.querySelector(".shop-main");
  let sub = btn.querySelector(".shop-sub");
  if (!main) {
    btn.textContent = "";
    main = document.createElement("span");
    main.className = "shop-main";
    sub = document.createElement("span");
    sub.className = "shop-sub";
    btn.append(main, sub);
  }
  main.textContent = n > 0 ? "ADD TO THE GAME · " + n + " NEW" : "ADD TO THE GAME";
  if (sub) sub.textContent = "Name it · be specific · files stay on your request";
}

async function refreshShopBench() {
  const el = $("shop-list");
  if (el && !shopCache.length) el.textContent = "Pulling requests…";
  const rows = await fetchShopTickets();
  renderShopList(rows);
  paintShopBadge(rows);
  return rows;
}

async function postShopTicket(text, name) {
  let body = String(text || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 500);
  const photos = shopPending.photos.slice();
  const clips = shopPending.clips.slice();
  const hand = String(name || commitHand(false) || ($("gate-name") && $("gate-name").value) || "")
    .trim()
    .toUpperCase()
    .slice(0, 20);
  if ((photos.length || clips.length) && !hand) {
    return { ok: false, err: "Put your name on it so the photo/clip stays with your request only." };
  }
  if (body.length < 4 && !(photos.length || clips.length)) {
    return { ok: false, err: "Write a real request — who, where, what they do." };
  }
  if (body.length < 18) {
    if (photos.length || clips.length) {
      /* attached files can carry a short caption if it's still a real ask */
      if (body.length < 4) body = "Use my attached photo/audio for this request only. Do not reuse on anyone else.";
    } else {
      return { ok: false, err: "Be more specific — name them, say where they stand, and what they say. “Add a guy” isn’t enough." };
    }
  }
  const slug = shopOwnerSlug(hand || "ANON");
  const pack = slug + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const photoUrls = [];
  const clipUrls = [];
  const meta = { owner: slug, pack };
  try {
    for (let i = 0; i < photos.length; i++) {
      const f = photos[i];
      const path = "shop/" + slug + "/" + pack + "/photo" + i + shopFileExt(f);
      photoUrls.push(await uploadShopBlob(path, f.blob, f.mime || "image/jpeg", meta));
    }
    for (let i = 0; i < clips.length; i++) {
      const f = clips[i];
      const path = "shop/" + slug + "/" + pack + "/" + (f.kind || "voice") + i + shopFileExt(f);
      clipUrls.push(await uploadShopBlob(path, f.blob, f.mime || "audio/mpeg", meta));
    }
  } catch (_) {
    /* Storage miss — ticket still lands; files go on the ticket as Firestore docs */
  }
  try {
    if (photoUrls.length || clipUrls.length) {
      const extra = [];
      extra.push("ATTACH pack=" + pack + " owner=" + slug);
      photoUrls.forEach((u) => extra.push("PHOTO " + u));
      clipUrls.forEach((u, i) => {
        const kind = (clips[i] && clips[i].kind) === "music" ? "MUSIC" : "VOICE";
        extra.push(kind + " " + u);
      });
      const stamped = body + "\n\n" + extra.join("\n");
      if (stamped.length <= 780) body = stamped;
    }
    const core = {
      name: { stringValue: (hand || "ANON").slice(0, 24) },
      who: { stringValue: getTraveler() === "tremont" ? "tremont" : "utah" },
      text: { stringValue: body.slice(0, 780) },
      ts: { timestampValue: new Date().toISOString() },
      status: { stringValue: "new" },
    };
    const fields = Object.assign({}, core, {
      photoN: { integerValue: String(photos.length) },
      clipN: { integerValue: String(clips.length) },
      pack: { stringValue: pack },
      owner: { stringValue: slug },
    });
    if (photoUrls.length) {
      fields.photoUrls = { arrayValue: { values: photoUrls.map((u) => ({ stringValue: u })) } };
    }
    if (clipUrls.length) {
      fields.clipUrls = { arrayValue: { values: clipUrls.map((u) => ({ stringValue: u })) } };
    }
    let doc;
    try {
      doc = await fsPost("tickets", fields);
    } catch (e) {
      if (e && (e.status === 403 || /403/.test(String(e.message || "")))) {
        doc = await fsPost("tickets", core);
      } else {
        throw e;
      }
    }
    shopPending = { photos: [], clips: [] };
    paintShopPending();
    shopMarkSent();
    return { ok: true, body, name: hand || "ANON", photoN: photos.length, clipN: clips.length };
  } catch (e) {
    const st = e && (e.status || e.message);
    return { ok: false, err: "Couldn't land the request (" + st + "). Try once more." };
  }
}

function openShop() {
  const scr = $("shop-screen");
  if (!scr) return;
  scr.classList.remove("hidden");
  const nm = $("shop-name");
  const st = $("shop-status");
  if (st) {
    st.classList.add("hidden");
    st.textContent = "";
  }
  if (nm && !nm.value) {
    nm.value = ($("gate-name") && $("gate-name").value) || commitHand(false) || "";
  }
  // Don't auto-focus the box — on a phone that just pops the keyboard
  // over a sheet you can't see.
  $("shop-text")?.blur();
  document.activeElement && document.activeElement.blur && document.activeElement.blur();
  refreshShopBench().then(() => {
    shopMarkSeen();
    paintShopBadge(shopCache);
  });
}

function closeShop() {
  $("shop-screen")?.classList.add("hidden");
  shopMarkSeen();
  paintShopBadge(shopCache);
}

$("btn-shop")?.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); openShop(); });
$("shop-close")?.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); closeShop(); });
$("shop-refresh")?.addEventListener("click", (e) => { e.preventDefault(); refreshShopBench(); });
["keydown", "keyup", "keypress"].forEach((ev) => {
  $("shop-text")?.addEventListener(ev, (e) => e.stopPropagation());
  $("shop-name")?.addEventListener(ev, (e) => e.stopPropagation());
});
function bindShopFile(id, handler) {
  const el = $(id);
  if (!el) return;
  el.addEventListener("click", (e) => e.stopPropagation());
  el.addEventListener("change", async (e) => {
    e.stopPropagation();
    const list = [...(e.target.files || [])];
    e.target.value = "";
    if (!list.length) return;
    await handler(list);
  });
}
bindShopFile("shop-photos", (list) => addShopPhotos(list));
bindShopFile("shop-voice", (list) => addShopClips(list, "voice"));
bindShopFile("shop-music", (list) => addShopClips(list, "music"));
$("shop-send")?.addEventListener("click", async (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (shopSending) return;
  const st = $("shop-status");
  const wait = SHOP_COOL_MS - (Date.now() - shopLastAt());
  if (wait > 0) {
    if (st) {
      st.classList.remove("hidden");
      st.classList.add("err");
      st.textContent = "Already got a request from this phone — wait " + Math.ceil(wait / 1000) + "s.";
    }
    return;
  }
  shopSending = true;
  if (st) {
    st.classList.remove("hidden", "err");
    st.textContent = (shopPending.photos.length || shopPending.clips.length)
      ? "Uploading request + files…"
      : "Sending request…";
  }
  const res = await postShopTicket($("shop-text")?.value || "", $("shop-name")?.value || "");
  shopSending = false;
  if (res.ok) {
    if (st) {
      st.classList.remove("err");
      st.textContent =
        "On the bench under " +
        (res.name || "ANON") +
        ". Files stay on this request only — they will not get reused on someone else’s add.";
    }
    toast("REQUEST SENT");
    if ($("shop-text")) $("shop-text").value = "";
    shopCache.unshift({
      id: "local",
      text: res.body || "",
      name: res.name || "ANON",
      who: getTraveler() === "tremont" ? "tremont" : "utah",
      createdAt: Date.now(),
      photoN: res.photoN || 0,
      clipN: res.clipN || 0,
    });
    renderShopList(shopCache);
    paintShopBadge(shopCache);
    refreshShopBench().catch(() => {});
  } else if (st) {
    st.classList.add("err");
    st.textContent = res.err || "Couldn't send.";
  }
});

setTimeout(() => { fetchShopTickets().then(paintShopBadge).catch(() => {}); }, 2500);
setInterval(() => {
  if (state && state.mode === "title") fetchShopTickets().then(paintShopBadge).catch(() => {});
}, 120000);

window.openShop = openShop;
window.closeShop = closeShop;
window.postShopTicket = postShopTicket;


$("btn-board").addEventListener("click", async () => {
  $("board-screen").classList.remove("hidden");
  const list = $("board-list");
  list.textContent = "Pulling the board…";
  try {
    flushPending();
    boardRows = await fetchBoard(true);
    renderBoardFiltered();
  } catch (err) {
    console.error(err);
    boardRows = crewSlots(loadCachedBoard());
    if (boardRows.length) {
      boardNote = "Gate's jammed — last cloud pull only.";
      renderBoardFiltered();
    } else {
      list.textContent = "";
      const d = document.createElement("div");
      d.className = "board-note";
      d.textContent = "Board's down — no signal at the gate. Try again in a minute.";
      list.appendChild(d);
    }
  }
});
$("board-close").addEventListener("click", () => $("board-screen").classList.add("hidden"));

/* gang box wiring */
function renderStore() {
  $("store-wallet").textContent = "BANK: " + getWallet().toLocaleString() + " PTS";
  const list = $("store-list");
  list.textContent = "";
  const fit = wornOutfit();
  const tremont = getTraveler() === "tremont";
  let lastSlot = "";
  for (const item of STORE) {
    // Pride tee is Utah's drip only — not on Tremont's rack
    if (item.utahOnly && tremont) continue;
    if (item.slot !== lastSlot) {
      lastSlot = item.slot;
      const h = document.createElement("div");
      h.className = "board-row hdr";
      h.textContent = SLOT_LABEL[item.slot];
      list.appendChild(h);
    }
    const row = document.createElement("div");
    row.className = "store-row";
    const name = document.createElement("span");
    name.className = "store-name";
    name.textContent = item.name;
    row.appendChild(name);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "set-btn";
    const equipped = fit[item.slot] === item.id;
    if (equipped) {
      btn.textContent = "WORN";
      btn.classList.add("on");
      btn.disabled = true;
    } else if (ownsItem(item.id)) {
      btn.textContent = "WEAR IT";
      btn.addEventListener("click", () => {
        if (item.utahOnly && getTraveler() === "tremont") {
          toast("UTAH'S TEE — SWITCH TRAVELER", true);
          return;
        }
        const f = getOutfit();
        f[item.slot] = item.id;
        try {
          localStorage.setItem("lw_outfit", JSON.stringify(f));
        } catch (_) {}
        rebuildPlayerBody();
        sfx("pickup");
        if (item.id === "shirt_pride") speakAs("utah", "Pride tee on. Loudest thing on this site besides the horns.");
        track("store_equip", { item: item.id });
        renderStore();
      });
    } else {
      btn.textContent = item.price.toLocaleString() + " PTS";
      btn.disabled = getWallet() < item.price;
      btn.addEventListener("click", () => {
        if (item.utahOnly && getTraveler() === "tremont") {
          toast("UTAH'S TEE — SWITCH TRAVELER", true);
          return;
        }
        if (getWallet() < item.price) return;
        try {
          const owned = getOwned().filter((id, i, a) => a.indexOf(id) === i);
          if (!owned.includes(item.id)) owned.push(item.id);
          localStorage.setItem("lw_owned", JSON.stringify(owned));
          const f = getOutfit();
          f[item.slot] = item.id;
          localStorage.setItem("lw_outfit", JSON.stringify(f));
        } catch (_) {
          return; // storage failed — nothing bought, nothing charged
        }
        addWallet(-item.price);
        rebuildPlayerBody();
        sfx("ok");
        vib([15, 25, 15]);
        toast("BOUGHT & WORN");
        if (item.id === "shirt_pride") speakAs("utah", "Pride tee on. Loudest thing on this site besides the horns.");
        track("store_buy", { item: item.id, price: item.price });
        renderStore();
      });
    }
    row.appendChild(btn);
    list.appendChild(row);
  }
}
function openStore() {
  renderStore();
  $("store-screen").classList.remove("hidden");
  if (state.mode === "play") state.mode = "store";
}
function closeStore() {
  $("store-screen").classList.add("hidden");
  if (state.mode === "store") state.mode = "play";
}
$("btn-store").addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  openStore();
});
$("store-close").addEventListener("click", () => closeStore());

try {
  applyTravelerUI();
} catch (err) {
  console.warn("[LW] traveler boot", err);
  fillDayPicker();
}
refreshTitle();
netBoot();
// debug/testing handle (module scope is otherwise sealed)
window.__controlsTest = {
  getYaw: () => cam.yaw,
  getSpeed: () => (typeof state !== "undefined" && state.mode === "play" ? 1 : 0),
  setKeys: (codes) => {
    for (const k in keys) keys[k] = false;
    for (const c of codes) keys[c] = true;
  },
};
window.LW = {
  state, player, cam, renderer, scene, camera, keys, mag, pull, dayState, siteRadio: SITE_RADIO,
  net, CB, zoneName, SPAWN,
  startShift,
  applyTravelerUI,
  setTraveler,
  getTraveler,
  getPickedDay: () => pickedDay,
  unlockedDays,
  fillDayPicker,
  openVesdaBoard,
  troubleInfo: () => (troubleSpec ? { status: troubleSpec.status, print: troubleSpec.print, see: troubleSpec.see, pack: isTremont() ? "power" : "fa" } : null),
  getDay: () => day,
  joePos: () => (state.joe ? [state.joe.mesh.position.x, state.joe.mesh.position.z] : null),
  softReset, saveCheckpoint, applyCheckpoint, tryInteract, openFacp, openPanel, openTrouble, showPrint,
  debugStep: (dt) => {
    if (state.mode === "play") {
      updatePlayer(dt);
      updateInteract();
      updateClock(dt);
    }
    if (state.mode === "mag") updateMag(dt);
    if (state.mode === "pull") updatePull(dt);
    if (state.mode === "play" || state.mode === "end") {
      updateHazards(dt, clock.elapsedTime + (LW._t = (LW._t || 0) + dt));
      updateCamera(dt);
    }
  },
};
loop();

try {
  const q = new URLSearchParams(location.search);
  if (q.get("drill") === "vesda") {
    const kind = q.get("kind") === "fault" ? "fault" : "fire";
    setTimeout(() => openVesdaBoard({ vesda: true, vesdaKind: kind, x: 1, z: 1 }), 300);
  }
} catch (_) {}

export const LIVE_WIRE = true;

