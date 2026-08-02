import { useSyncExternalStore } from "react";
import { demoRepository } from "./demoRepository";

function subscribe(listener: () => void) { return demoRepository.subscribe(listener); }
function getSnapshot() { return demoRepository.getSnapshot(); }

export function useDemoData() { return useSyncExternalStore(subscribe, getSnapshot, getSnapshot); }
