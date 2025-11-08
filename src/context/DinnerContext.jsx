"use client";

import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from "react";
import { track } from "@/lib/track";
import { getTimeCategory } from "@/utils/timeContext";

const DinnerContext = createContext(null);

const LAYERS = ["region", "experience", "specialized", "distance"];
const WEATHER_TTL = 30 * 60 * 1000;
const WEATHER_FAIL_TTL = 10 * 60 * 1000;

function createLayerState(mode = "any", selected = []) {
  return { mode, selected: new Set(selected) };
}

function createDefaultFilters() {
  return {
    region: createLayerState(),
    experience: createLayerState(),
    specialized: createLayerState(),
    distance: createLayerState(),
  };
}

function serializeFilters(filters) {
  const out = {};
  LAYERS.forEach((layer) => {
    const next = filters?.[layer];
    out[layer] = {
      mode: next?.mode === "custom" ? "custom" : "any",
      selected: Array.from(next?.selected || []),
    };
  });
  return out;
}

function hydrateFilters(raw) {
  if (!raw || typeof raw !== "object") return createDefaultFilters();
  const hydrated = {};
  LAYERS.forEach((layer) => {
    const row = raw[layer];
    if (row && typeof row === "object" && Array.isArray(row.selected)) {
      hydrated[layer] = createLayerState(row.mode === "custom" ? "custom" : "any", row.selected);
    } else if (Array.isArray(row)) {
      hydrated[layer] = createLayerState(row.length ? "custom" : "any", row);
    } else {
      hydrated[layer] = createLayerState();
    }
  });
  return hydrated;
}

export function DinnerProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem("dd_user") : null;
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [filters, setFilters] = useState(createDefaultFilters);
  const [restaurants, setRestaurants] = useState([]);
  const [restaurantsCache, setRestaurantsCache] = useState([]);
  const [selectedCombo, setSelectedCombo] = useState(null);
  const [location, setLocation] = useState(null);
  const [r1Rerolls, setR1Rerolls] = useState(0);
  const [r2Rerolls, setR2Rerolls] = useState(0);
  const [r2Seed, setR2Seed] = useState(null);
  const [payments, setPayments] = useState(() => {
    try { return JSON.parse(localStorage.getItem("dd_payments") || "[]"); } catch { return []; }
  });
  const [savedRestaurants, setSavedRestaurants] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("dd_saved_restaurants") || "[]");
    } catch {
      return [];
    }
  });
  const [moodState, setMoodState] = useState(() => {
    try {
      return typeof window !== "undefined" ? localStorage.getItem("dd_mood") || "any" : "any";
    } catch {
      return "any";
    }
  });
  const [weather, setWeather] = useState(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = sessionStorage.getItem("dd_weather_signal");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const weatherRef = useRef(null);
  const weatherRequestRef = useRef(null);
  const weatherFailureRef = useRef(null);
  const [preferences, setPreferences] = useState({ likes: [], dislikes: [] });
  const [prefsMeta, setPrefsMeta] = useState({ userId: null, fetchedAt: 0 });
  const [timeCategory, setTimeCategory] = useState(() => getTimeCategory());
  const firstCategoryAtRef = useRef(Date.now());
  const lastCategoryRef = useRef(timeCategory);
  const brunchLoggedRef = useRef(false);
  const lateLoggedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try { brunchLoggedRef.current = sessionStorage.getItem("dd_brunch_logged") === "1"; } catch {}
    try { lateLoggedRef.current = sessionStorage.getItem("dd_late_logged") === "1"; } catch {}
  }, []);

  useEffect(() => {
    const category = timeCategory;
    if (!category) return;
    const iso = new Date().toISOString();
    try {
      track("time_category_detected", { category, iso });
      console.log(`🕒 TimeContext → ${category}`);
      if (category === "Brunch" && !brunchLoggedRef.current) {
        track("brunch_mode_triggered", { iso });
        brunchLoggedRef.current = true;
        try { sessionStorage.setItem("dd_brunch_logged", "1"); } catch {}
      }
      if (category === "Late Night" && !lateLoggedRef.current) {
        track("late_night_mode_triggered", { iso });
        lateLoggedRef.current = true;
        try { sessionStorage.setItem("dd_late_logged", "1"); } catch {}
      }
    } catch {}
    lastCategoryRef.current = category;
  }, [timeCategory]);

  useEffect(() => {
    firstCategoryAtRef.current = Date.now();
    lastCategoryRef.current = getTimeCategory();
    setTimeCategory(lastCategoryRef.current);

    const checkCategory = () => {
      const next = getTimeCategory();
      if (!next || next === lastCategoryRef.current) return;
      const now = Date.now();
      if (now - firstCategoryAtRef.current >= 30 * 60 * 1000) {
        try {
          track("time_category_transition", {
            from: lastCategoryRef.current,
            to: next,
            minutesOpen: Math.round((now - firstCategoryAtRef.current) / 60000),
          });
        } catch {}
      }
      lastCategoryRef.current = next;
      setTimeCategory(next);
    };

    const quickCheck = setTimeout(checkCategory, 5000);
    const interval = setInterval(checkCategory, 5 * 60 * 1000);
    return () => {
      clearTimeout(quickCheck);
      clearInterval(interval);
    };
  }, []);

  function saveRestaurant(r) {
    const updated = [...savedRestaurants, r];
    setSavedRestaurants(updated);
    try { localStorage.setItem("dd_saved_restaurants", JSON.stringify(updated)); } catch {}
  }

  useEffect(() => {
    try {
      const stored = localStorage.getItem("dd_filters_v2") || localStorage.getItem("dd_filters");
      if (stored) {
        const parsed = JSON.parse(stored);
        setFilters(hydrateFilters(parsed));
      }
      if (localStorage.getItem("dd_filters")) localStorage.removeItem("dd_filters");
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("dd_filters_v2", JSON.stringify(serializeFilters(filters)));
    } catch {}
  }, [filters]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!Array.isArray(restaurantsCache)) return;
    try {
      if (restaurantsCache.length) {
        localStorage.setItem("dd_last_shortlist", JSON.stringify(restaurantsCache));
      } else {
        localStorage.removeItem("dd_last_shortlist");
      }
    } catch {}
  }, [restaurantsCache]);

  useEffect(() => {
    try { localStorage.setItem("dd_user", JSON.stringify(user)); } catch {}
  }, [user]);

  useEffect(() => {
    try { localStorage.setItem("dd_payments", JSON.stringify(payments)); } catch {}
  }, [payments]);

  useEffect(() => {
    try { localStorage.setItem("dd_mood", moodState); } catch {}
  }, [moodState]);

  useEffect(() => {
    weatherRef.current = weather;
  }, [weather]);

  const ensureWeather = useCallback(async (lat, lng) => {
    if (!lat || !lng) return null;
    const cached = weatherRef.current;
    const now = Date.now();
    if (cached && cached.lat === lat && cached.lng === lng && cached.fetchedAt && now - cached.fetchedAt < WEATHER_TTL) {
      return cached;
    }

    const recentFailure = weatherFailureRef.current;
    if (recentFailure && now - recentFailure.at < WEATHER_FAIL_TTL) {
      return null;
    }

    if (weatherRequestRef.current) {
      return weatherRequestRef.current;
    }

    const request = (async () => {
      const startedAt = Date.now();
      try {
        const res = await fetch(`/api/weather?lat=${lat}&lng=${lng}`, { cache: "no-store" });
        if (res.status === 401) {
          weatherFailureRef.current = { at: Date.now(), status: 401 };
          console.warn("weather_fetch_error", "unauthorized");
          return null;
        }
        if (!res.ok) {
          weatherFailureRef.current = { at: Date.now(), status: res.status };
          console.warn("weather_fetch_error", `status_${res.status}`);
          return null;
        }
        const data = await res.json();
        const payload = { ...data, lat, lng, fetchedAt: startedAt };
        weatherFailureRef.current = null;
        setWeather(payload);
        try { sessionStorage.setItem("dd_weather_signal", JSON.stringify(payload)); } catch {}
        try { track("weather_signal_applied", { bucket: data?.bucket, condition: data?.condition, tempC: data?.temperatureC }); } catch {}
        return payload;
      } catch (err) {
        weatherFailureRef.current = { at: Date.now(), status: "network" };
        console.warn("weather_fetch_error", err);
        return null;
      }
    })();

    weatherRequestRef.current = request;
    const result = await request;
    weatherRequestRef.current = null;
    if (result) {
      weatherRef.current = result;
    }
    return result;
  }, [setWeather]);

  const refreshPreferences = useCallback(async (userId) => {
    if (!userId) return null;
    const now = Date.now();
    const cacheKey = `dd_user_prefs_${userId}`;
    if (prefsMeta.userId === userId && prefsMeta.fetchedAt && now - prefsMeta.fetchedAt < 10 * 60 * 1000) {
      return preferences;
    }
    try {
      const cachedRaw = localStorage.getItem(cacheKey);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw);
        if (cached?.likes && now - (cached?.fetchedAt || 0) < 6 * 60 * 60 * 1000) {
          setPreferences({ likes: cached.likes || [], dislikes: cached.dislikes || [] });
          setPrefsMeta({ userId, fetchedAt: now });
          return cached;
        }
      }
    } catch {}
    try {
      const res = await fetch(`/api/preferences?userId=${encodeURIComponent(userId)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`prefs_fetch_failed_${res.status}`);
      const data = await res.json();
      const likes = Array.isArray(data?.likes) ? data.likes : [];
      const dislikes = Array.isArray(data?.dislikes) ? data.dislikes : [];
      const payload = { likes, dislikes };
      setPreferences(payload);
      setPrefsMeta({ userId, fetchedAt: now });
      try { localStorage.setItem(cacheKey, JSON.stringify({ ...payload, fetchedAt: now })); } catch {}
      return payload;
    } catch (err) {
      console.warn("prefs_fetch_error", err);
      return null;
    }
  }, [prefsMeta, preferences]);

  useEffect(() => {
    if (user?.id) {
      refreshPreferences(user.id);
    }
  }, [user?.id, refreshPreferences]);

  const setMood = useCallback((nextMood) => {
    setMoodState(nextMood || "any");
    try { track("mood_selected", { mood: nextMood || "any" }); } catch {}
  }, []);

  const value = useMemo(
    () => ({
      user,
      setUser,
      filters,
      setFilters,
      restaurants,
      setRestaurants,
      restaurantsCache,
      setRestaurantsCache,
      selectedCombo,
      setSelectedCombo,
      location,
      setLocation,
      r1Rerolls,
      setR1Rerolls,
      r2Rerolls,
      setR2Rerolls,
      r2Seed,
      setR2Seed,
      payments,
      setPayments,
      savedRestaurants,
      setSavedRestaurants,
      saveRestaurant,
      mood: moodState,
      setMood,
  ensureWeather,
      weather,
      preferences,
      refreshPreferences,
      timeCategory,
    }),
    [
      user,
      filters,
      restaurants,
      restaurantsCache,
      selectedCombo,
      location,
      r1Rerolls,
      r2Rerolls,
      r2Seed,
      payments,
      savedRestaurants,
      moodState,
      ensureWeather,
      weather,
      preferences,
      setMood,
      refreshPreferences,
      timeCategory,
    ]
  );

  return <DinnerContext.Provider value={value}>{children}</DinnerContext.Provider>;
}

export function useDinner() {
  const ctx = useContext(DinnerContext);
  if (!ctx) throw new Error("useDinner must be used within DinnerProvider");
  return ctx;
}
