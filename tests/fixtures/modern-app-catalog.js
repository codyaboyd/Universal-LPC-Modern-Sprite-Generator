/** A deliberately tiny catalog covering composition, compatibility and choices. */
export const modernAppItems = {
  body_male: item("Body", "body", ["male"], 0, ["light", "dark"]),
  body_female: item("Body", "body", ["female"], 0, ["light", "dark"]),
  hair_short: item("Short hair", "hair", ["male", "female"], 80, [
    "brown",
    "black",
  ]),
  hair_long: item("Long hair", "hair", ["female"], 80, ["blonde", "black"]),
  shirt: item("Travel shirt", "torso", ["male", "female"], 30, ["blue", "red"]),
  plate: item("Plate armor", "torso", ["male"], 40, ["steel", "gold"]),
  sword: item("Sword", "weapon", ["male", "female"], 120, ["steel"]),
};

export const modernAppTree = {
  items: [],
  children: {
    Body: { items: ["body_male", "body_female"] },
    Hair: { items: ["hair_short", "hair_long"] },
    Equipment: { items: ["shirt", "plate", "sword"] },
  },
};

function item(name, type_name, required, zPos, variants) {
  return {
    name,
    type_name,
    required,
    animations: ["walk", "idle"],
    variants,
    recolors: [],
    matchBodyColor: type_name === "body",
    path: [type_name],
    layers: {
      layer_1: {
        male: `fixture/${type_name}/`,
        female: `fixture/${type_name}/`,
        zPos,
      },
    },
    credits: [],
  };
}
