// NECircle vehicle contact page translations.
// Kokborok phrases are best-effort approximations in Roman script —
// verify with a native speaker before printing on real stickers.
export const LANGS = [
  { code: "en", label: "English", color: "#FFE44D" }, // yellow
  { code: "kok", label: "Kokborok", color: "#FF3B7F" }, // pink
  { code: "bn", label: "বাংলা", color: "#7C4DFF" }, // purple
];

export const T = {
  en: {
    contact_title: "Contact vehicle owner",
    why: "Why contact the vehicle owner?",
    reasons: {
      lights: "The lights of this car are on.",
      no_parking: "The car is in no parking.",
      towed: "The car is getting towed.",
      open: "The window or car is open.",
      wrong: "Something wrong with this car.",
    },
    message: "Message",
    call: "Private call",
    emergency: "Emergency",
    spam: "Spam may get your IP and number blocked for up to 6 months.",
    priv: "Owner's number stays private. No account or app needed.",
    region: "TRIPURA · IND",
    wa: (plate, reason) =>
      reason
        ? `Hi, regarding your vehicle ${plate}: ${reason}`
        : `Hi, regarding your vehicle ${plate}.`,
  },
  kok: {
    contact_title: "Motor mualwi bai swrwng",
    why: "Bono swrwng?",
    reasons: {
      lights: "I motor-o light burung dwng.",
      no_parking: "Motor no parking-o thang.",
      towed: "Motor-be lai togo dwng.",
      open: "Janla ba dwar khulu dwng.",
      wrong: "Motor-o twi kotor dwng.",
    },
    message: "Khumtwi",
    call: "Sarwm phone",
    emergency: "Bipod",
    spam: "Spam mano ni IP arw number 6 mas maidong lock kwrwi.",
    priv: "Mualwi-ni number sarwm thai. App ba account bo lagia.",
    region: "TWIPRA · IND",
    wa: (plate, reason) =>
      reason
        ? `Kwlwi, ni motor ${plate} bai: ${reason}`
        : `Kwlwi, ni motor ${plate} bai.`,
  },
  bn: {
    contact_title: "গাড়ির মালিকের সাথে যোগাযোগ",
    why: "কেন যোগাযোগ করছেন?",
    reasons: {
      lights: "এই গাড়ির লাইট জ্বলছে।",
      no_parking: "গাড়িটি নো-পার্কিং এ আছে।",
      towed: "গাড়িটি টো করা হচ্ছে।",
      open: "জানালা বা দরজা খোলা আছে।",
      wrong: "গাড়িতে কিছু সমস্যা আছে।",
    },
    message: "বার্তা",
    call: "প্রাইভেট কল",
    emergency: "জরুরি",
    spam: "স্প্যাম করলে আপনার IP ও নম্বর ৬ মাস পর্যন্ত ব্লক হতে পারে।",
    priv: "মালিকের নম্বর গোপন থাকে। কোনো অ্যাপ বা অ্যাকাউন্ট লাগবে না।",
    region: "ত্রিপুরা · ভারত",
    wa: (plate, reason) =>
      reason
        ? `নমস্কার, আপনার গাড়ি ${plate} সম্পর্কে: ${reason}`
        : `নমস্কার, আপনার গাড়ি ${plate} সম্পর্কে।`,
  },
};
