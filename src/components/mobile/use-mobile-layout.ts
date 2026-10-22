"use client";
import { useSyncExternalStore } from "react";
const subscribe = (callback: () => void) => { const query = window.matchMedia("(max-width: 1023px)"); query.addEventListener("change", callback); return () => query.removeEventListener("change", callback); };
export function useMobileLayout() { return useSyncExternalStore(subscribe, () => window.matchMedia("(max-width: 1023px)").matches, () => false); }
