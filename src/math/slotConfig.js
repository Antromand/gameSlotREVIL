import sym1Image from "../../assets/symbols/sym1-cage.png";
import sym2Image from "../../assets/symbols/sym2-medallion.png";
import sym3Image from "../../assets/symbols/sym3-dagger.png";
import sym4Image from "../../assets/symbols/sym4-ring.png";
import sym5Image from "../../assets/symbols/sym5-hand.png";
import sym6Image from "../../assets/symbols/sym6-head.png";
import sym7Image from "../../assets/symbols/sym7-totem.png";
import sym8Image from "../../assets/symbols/sym8-ritual-warrior.png";
import sym9Image from "../../assets/symbols/sym9-armored-warrior.png";
import wildImage from "../../assets/symbols/wild.png";
import wildX2Image from "../../assets/symbols/wildx2.png";
import wildX3Image from "../../assets/symbols/wildx3.png";
import wildX4Image from "../../assets/symbols/wildx4.png";
import wildX5Image from "../../assets/symbols/wildx5.png";
import scatterImage from "../../assets/symbols/scatter.png";
import {
  BET_OPTIONS,
  DEFAULT_BALANCE,
  DEFAULT_PROFILE_ID,
  GRID_COLUMNS,
  GRID_ROWS,
  SLOT_PROFILES,
  SYMBOL_DEFS as SYMBOL_DATA_DEFS,
  SYMBOL_ORDER
} from "./slotData.js";

export {
  BET_OPTIONS,
  DEFAULT_BALANCE,
  DEFAULT_PROFILE_ID,
  GRID_COLUMNS,
  GRID_ROWS,
  SLOT_PROFILES,
  SYMBOL_ORDER
};

export const WILD_ICON_BY_MULTIPLIER = {
  1: wildImage,
  2: wildX2Image,
  3: wildX3Image,
  4: wildX4Image,
  5: wildX5Image
};

const SYMBOL_ICON_BY_ID = {
  wild: wildImage,
  sym1: sym1Image,
  sym2: sym2Image,
  sym3: sym3Image,
  sym4: sym4Image,
  sym5: sym5Image,
  sym6: sym6Image,
  sym7: sym7Image,
  sym8: sym8Image,
  sym9: sym9Image,
  scatter: scatterImage,
  blank: ""
};

export const SYMBOL_DEFS = Object.fromEntries(
  Object.entries(SYMBOL_DATA_DEFS).map(([symbolId, symbol]) => [
    symbolId,
    {
      ...symbol,
      icon: SYMBOL_ICON_BY_ID[symbolId] ?? ""
    }
  ])
);
