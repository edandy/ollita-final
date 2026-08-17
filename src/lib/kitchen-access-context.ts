import { createContext, useContext } from "react";

export const KitchenAccessContext = createContext({ readOnly: false });

export function useKitchenAccess() {
  return useContext(KitchenAccessContext);
}
