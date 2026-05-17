"use client";

import { useState, useEffect } from "react";
import { detectClientPlatformOs, type PlatformOS } from "@/lib/utils";

const MOBILE_BREAKPOINT = 768;

/**
 * Returns true if the user is using a mobile device.
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}

/**
 * Returns true if the user is using a Mac.
 */
export function useIsMac() {
  const platformOs = usePlatformOs();

  return platformOs === "macos";
}

/**
 * Returns the browser-detected OS family.
 * Useful for client-side UI decisions that vary by platform.
 */
export function usePlatformOs(): PlatformOS {
  const [platformOs, setPlatformOs] = useState<PlatformOS>("unknown");

  useEffect(() => {
    setPlatformOs(detectClientPlatformOs());
  }, []);

  return platformOs;
}
