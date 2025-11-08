"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useDinner } from "@/context/DinnerContext";
import { track } from "@/lib/track";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

function getSessionKey(code) {
	return `dd_group_${code}`;
}

function getLatestShortlist() {
	if (typeof window === "undefined") return [];
	try {
		const raw = localStorage.getItem("dd_last_shortlist");
		const parsed = raw ? JSON.parse(raw) : [];
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

const PARTICIPANT_ID_PREFIX = "dd_group_participant_id";
const DISPLAY_NAME_KEY = "dd_group_display_name";

function generateParticipantId() {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
	let next = "";
	for (let index = 0; index < 12; index += 1) {
		next += alphabet[Math.floor(Math.random() * alphabet.length)];
	}
	return next;
}

function ensureParticipantId(code) {
	if (typeof window === "undefined") return "anon";
	const scopedKey = `${PARTICIPANT_ID_PREFIX}_${code}`;
	try {
		const store = window.sessionStorage;
		let value = store.getItem(scopedKey);
		if (value) return value;
		value = generateParticipantId();
		store.setItem(scopedKey, value);
		return value;
	} catch {
		try {
			let value = localStorage.getItem(scopedKey);
			if (!value) {
				const oldGlobal = localStorage.getItem(PARTICIPANT_ID_PREFIX);
				value = oldGlobal || generateParticipantId();
			}
			if (value) return value;
			value = generateParticipantId();
			localStorage.setItem(scopedKey, value);
			return value;
		} catch {
			return "anon";
		}
	}
}

function readStoredParticipantName() {
	if (typeof window === "undefined") return null;
	try {
		const raw = localStorage.getItem(DISPLAY_NAME_KEY);
		return raw && raw.trim() ? raw.trim() : null;
	} catch {
		return null;
	}
}

function persistParticipantName(name) {
	if (typeof window === "undefined") return;
	try {
		if (name && name.trim()) {
			localStorage.setItem(DISPLAY_NAME_KEY, name.trim());
		}
	} catch {}
}

function loadSession(code, restaurants) {
	try {
		const raw = localStorage.getItem(getSessionKey(code));
		if (raw) return JSON.parse(raw);
	} catch {}
	return {
		groupCode: code,
		votes: {},
		restaurants: Array.isArray(restaurants) ? restaurants : [],
		version: 0,
		lastUpdatedAt: Date.now(),
 		ownerParticipantId: null,
 		ownerDisplayName: null,
	};
}

function saveSession(code, session) {
	try {
		localStorage.setItem(getSessionKey(code), JSON.stringify(session));
	} catch {}
}

function applyVotes(base, voteMap) {
	const votes = { ...(base.votes || {}) };
	Object.entries(voteMap || {}).forEach(([name, score]) => {
		votes[name] = score;
	});
	return votes;
}

function formatTime(seconds) {
	const minutes = Math.floor(seconds / 60);
	const remainder = seconds % 60;
	return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

export default function GroupSessionPage() {
	const { code } = useParams();
	const { restaurantsCache, user } = useDinner();

	const [session, setSession] = useState(() => loadSession(code, restaurantsCache));
	const [page, setPage] = useState(0);
	const [winner, setWinner] = useState(null);
	const [timeLeft, setTimeLeft] = useState(90);
	const [participants, setParticipants] = useState([]);

	const participantId = useMemo(() => ensureParticipantId(code), [code]);
	const fallbackName = useMemo(() => (user?.name && user.name.trim()) || "Guest", [user?.name]);
	const [displayName, setDisplayName] = useState("Guest");
	const [hydrated, setHydrated] = useState(false);
	const supabase = useMemo(() => getSupabaseBrowserClient(), []);

	const channelRef = useRef(null);
	const sessionRef = useRef(session);
	const persistTimerRef = useRef(null);
	const pendingPersistRef = useRef(null);

	useEffect(() => {
		sessionRef.current = session;
	}, [session]);

	useEffect(() => {
		setHydrated(true);
	}, []);

	useEffect(() => {
		if (!hydrated) return;
		const stored = readStoredParticipantName();
		if (stored && stored !== displayName) {
			setDisplayName(stored);
			return;
		}
		if (!stored && fallbackName && fallbackName !== displayName) {
			setDisplayName(fallbackName);
			persistParticipantName(fallbackName);
		}
	}, [displayName, fallbackName, hydrated]);

	useEffect(() => () => {
		if (persistTimerRef.current) {
			clearTimeout(persistTimerRef.current);
			persistTimerRef.current = null;
		}
	}, []);

	const handleNamePrompt = useCallback(() => {
		if (typeof window === "undefined") return;
		const current = (displayName || "").trim();
		const input = window.prompt("Enter your name", current);
		if (input === null) return;
		const next = input.trim() || "Guest";
		setDisplayName(next);
		persistParticipantName(next);
	}, [displayName]);

	useEffect(() => {
		const channel = channelRef.current;
		if (!channel) return;
		const payload = { displayName, last_active_at: new Date().toISOString() };
		if (typeof channel.updatePresence === "function") {
			channel.updatePresence(payload).catch(() => {});
		} else if (typeof channel.track === "function") {
			channel.track(payload).catch(() => {});
		}
	}, [displayName]);

	const broadcast = useCallback(
		(event, payload) => {
			const channel = channelRef.current;
			if (!channel) return;
			channel
				.send({ type: "broadcast", event, payload: { ...payload, participantId } })
				.catch((error) => console.warn("group_broadcast_error", error));
		},
		[participantId]
	);

	const schedulePersist = useCallback(
		(snapshot) => {
			if (!code || !snapshot) return;
			pendingPersistRef.current = snapshot;
			if (persistTimerRef.current) return;
			persistTimerRef.current = setTimeout(async () => {
				persistTimerRef.current = null;
				const latest = pendingPersistRef.current;
				if (!latest) return;
				try {
					await fetch("/api/group-session/state", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ code, session: latest }),
					});
				} catch (error) {
					console.warn("group_state_persist_error", error);
				}
			}, 400);
		},
		[code]
	);

			useEffect(() => {
				const current = sessionRef.current;
				const isOwner = !current?.ownerParticipantId || current.ownerParticipantId === participantId;
				if (!isOwner) return;
				if ((current?.restaurants?.length ?? 0) === 0 && (restaurantsCache?.length ?? 0) > 0) {
					const next = {
						...current,
						restaurants: restaurantsCache,
						votes: {},
						version: (current?.version || 0) + 1,
						lastUpdatedAt: Date.now(),
						ownerParticipantId: current?.ownerParticipantId || participantId,
						ownerDisplayName: current?.ownerDisplayName || displayName,
					};
					sessionRef.current = next;
					setSession(next);
					saveSession(code, next);
					setWinner(null);
					schedulePersist(next);
					broadcast("state", { session: next });
				}
		}, [broadcast, code, displayName, participantId, restaurantsCache, schedulePersist]);

			useEffect(() => {
				if (typeof window === "undefined") return;
				const applyShortlist = (list) => {
					if (!Array.isArray(list) || list.length === 0) return;
					const current = sessionRef.current;
					const isOwner = !current?.ownerParticipantId || current.ownerParticipantId === participantId;
					if (!isOwner) return;
					let updated = null;
					setSession((prev) => {
						const next = {
							...prev,
							restaurants: list,
							votes: {},
							version: (prev.version || 0) + 1,
							lastUpdatedAt: Date.now(),
							ownerParticipantId: prev.ownerParticipantId || participantId,
							ownerDisplayName: prev.ownerDisplayName || displayName,
						};
						updated = next;
						return next;
					});
					if (updated) {
						sessionRef.current = updated;
						saveSession(code, updated);
						schedulePersist(updated);
						broadcast("state", { session: updated });
						setWinner(null);
					}
				};

				const initial = getLatestShortlist();
				if ((sessionRef.current?.restaurants?.length || 0) === 0 && initial.length) {
					applyShortlist(initial);
				}

				const handler = (event) => {
					if (event.key === "dd_last_shortlist" && event.newValue) {
						try {
							const parsed = JSON.parse(event.newValue);
							applyShortlist(parsed);
						} catch {}
					}
				};

				window.addEventListener("storage", handler);
				return () => window.removeEventListener("storage", handler);
			}, [broadcast, code, displayName, participantId, schedulePersist]);

	const currentSlice = useMemo(() => {
		const start = page * 3;
		return session.restaurants.slice(start, start + 3);
	}, [session.restaurants, page]);

	const voteSnapshot = useMemo(() => {
		const votes = session.votes || {};
		const items = Object.entries(votes)
			.map(([name, score]) => ({
				name,
				score,
				restaurant: session.restaurants.find((item) => item.name === name) || null,
			}))
			.filter((entry) => entry.restaurant);
		items.sort((a, b) => b.score - a.score);
		return items.slice(0, 5);
	}, [session.restaurants, session.votes]);

	useEffect(() => {
		if (!code || session.restaurants.length > 0) return;
		let cancelled = false;
		(async () => {
			try {
				const res = await fetch(`/api/group-session/state?code=${encodeURIComponent(code)}`, {
					cache: "no-store",
				});
				if (!res.ok) return;
				const data = await res.json();
				const latest = data?.session;
				if (!cancelled && latest?.restaurants?.length) {
					let updated = null;
					setSession((prev) => {
						const next = {
							...prev,
							...latest,
							restaurants: latest.restaurants,
						};
						updated = next;
						return next;
					});
					if (updated) {
						sessionRef.current = updated;
						saveSession(code, updated);
						setWinner(null);
					}
				}
			} catch (error) {
				console.warn("group_state_fetch_fallback_error", error);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [code, session.restaurants.length]);

	const handleVote = useCallback(
		(name, delta) => {
			let updated = null;
			let nextScoreValue = 0;
			setSession((prev) => {
				const votes = { ...(prev.votes || {}) };
				nextScoreValue = (votes[name] || 0) + delta;
				votes[name] = nextScoreValue;
				const next = {
					...prev,
					votes,
					version: (prev.version || 0) + 1,
					lastUpdatedAt: Date.now(),
					ownerParticipantId: prev.ownerParticipantId || participantId,
					ownerDisplayName: prev.ownerDisplayName || displayName,
				};
				updated = next;
				return next;
			});
			if (updated) {
				sessionRef.current = updated;
				saveSession(code, updated);
				setWinner(null);
				schedulePersist(updated);
				broadcast("vote", {
					name,
					votes: { [name]: nextScoreValue },
					version: updated.version,
				});
			}
		},
		[broadcast, code, displayName, participantId, schedulePersist]
	);

	const handleFinalize = useCallback(() => {
		try {
			track("group_finalize");
		} catch {}
		const entries = Object.entries(session.votes || {});
		if (!entries.length) {
			setWinner(null);
			return;
		}
		let best = null;
		for (const [name, score] of entries) {
			const rest = session.restaurants.find((restaurant) => restaurant.name === name);
			const rating = rest?.rating ?? 0;
			if (!best) {
				best = { name, score, rating, item: rest };
			} else {
				const cmp = score - best.score || rating - best.rating || 0;
				if (cmp > 0) best = { name, score, rating, item: rest };
			}
		}
		const selection = best?.item || null;
		setWinner(selection);
		if (selection) {
			broadcast("finalize", { winner: selection });
		}
		schedulePersist(sessionRef.current);
	}, [broadcast, schedulePersist, session]);

	useEffect(() => {
		const interval = setInterval(() => {
			setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
		}, 1000);
		return () => clearInterval(interval);
	}, []);

	useEffect(() => {
		if (timeLeft === 0 && !winner) {
			handleFinalize();
		}
	}, [handleFinalize, timeLeft, winner]);

	useEffect(() => {
		if (!supabase || !code) return;

		const channel = supabase.channel(`group-session:${code}`, {
			config: {
				presence: { key: participantId },
			},
		});

		try {
			console.info("group_channel_init", { code, participantId });
		} catch {}

		const computePresenceList = () => {
			const presence = channel.presenceState();
			const list = [];
			Object.entries(presence).forEach(([id, values]) => {
				const name = (values?.[0]?.displayName || "Guest").toString().trim() || "Guest";
				list.push({
					id,
					name,
					lastSeenAt: values?.[0]?.last_active_at || null,
				});
			});
			list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
			return list;
		};

		channel
			.on("broadcast", { event: "vote" }, ({ payload }) => {
				try {
					console.info("group_broadcast_vote", {
						from: payload?.participantId,
						version: payload?.version,
						self: participantId,
					});
				} catch {}
				if (!payload || payload.participantId === participantId) return;
				let updated = null;
				setSession((prev) => {
					const incomingVersion = payload.version || 0;
					if ((prev.version || 0) >= incomingVersion) return prev;
					const next = {
						...prev,
						votes: applyVotes(prev, payload.votes || {}),
						version: incomingVersion,
						lastUpdatedAt: Date.now(),
						ownerParticipantId: sessionRef.current?.ownerParticipantId || prev.ownerParticipantId || null,
						ownerDisplayName: sessionRef.current?.ownerDisplayName || prev.ownerDisplayName || null,
					};
					updated = next;
					return next;
				});
				if (updated) {
					sessionRef.current = updated;
					saveSession(code, updated);
					setWinner(null);
					schedulePersist(updated);
				}
			})
			.on("broadcast", { event: "state" }, ({ payload }) => {
				try {
					console.info("group_broadcast_state", {
						from: payload?.participantId,
						version: payload?.session?.version,
						self: participantId,
					});
				} catch {}
				if (!payload || payload.participantId === participantId) return;
				const incoming = payload.session || {};
				const incomingVersion = incoming.version || 0;
				const currentVersion = sessionRef.current?.version || 0;
				if (incomingVersion <= currentVersion) return;
				const next = {
					...sessionRef.current,
					...incoming,
					restaurants: incoming.restaurants?.length
						? incoming.restaurants
						: sessionRef.current.restaurants,
				};
				sessionRef.current = next;
				setSession(next);
				saveSession(code, next);
				setWinner(null);
				schedulePersist(next);
			})
			.on("broadcast", { event: "request_state" }, ({ payload }) => {
				try {
					console.info("group_broadcast_request_state", {
						from: payload?.participantId,
						self: participantId,
						restaurants: sessionRef.current?.restaurants?.length || 0,
					});
				} catch {}
				if (!payload || payload.participantId === participantId) return;
				const current = sessionRef.current;
				if (current && (current.restaurants?.length || 0) > 0) {
					broadcast("state", { session: current });
				}
			})
			.on("broadcast", { event: "finalize" }, ({ payload }) => {
				try {
					console.info("group_broadcast_finalize", {
						from: payload?.participantId,
						self: participantId,
					});
				} catch {}
				if (!payload || payload.participantId === participantId) return;
				setWinner(payload.winner || null);
			})
			.on("presence", { event: "sync" }, () => {
				setParticipants(computePresenceList());
			});

		channel.subscribe(async (status) => {
			if (status === "SUBSCRIBED") {
				try {
					console.info("group_channel_subscribed", { code, participantId });
				} catch {}
				await channel.track({ displayName, last_active_at: new Date().toISOString() });
				setParticipants(computePresenceList());
				const current = sessionRef.current;
				if (current && (current.restaurants?.length || 0) > 0) {
					try {
						console.info("group_channel_send_state_on_join", {
							version: current.version,
							restaurants: current.restaurants?.length || 0,
						});
					} catch {}
					broadcast("state", { session: current });
				} else {
					try {
						console.info("group_channel_request_state", { code, participantId });
					} catch {}
					broadcast("request_state", {});
				}
			}
		});

		channelRef.current = channel;

		return () => {
			supabase.removeChannel(channel);
			channelRef.current = null;
		};
	}, [broadcast, code, displayName, participantId, schedulePersist, supabase]);

	const handleCopy = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(window.location.href);
			alert("Link copied!");
		} catch {
			alert(window.location.href);
		}
	}, []);

	const handleInviteSMS = useCallback(() => {
		const body = encodeURIComponent(`Join our DinnerDecider group! Use this link: ${window.location.href}`);
		window.location.href = `sms:?body=${body}`;
	}, []);

	const handleInviteWhatsApp = useCallback(() => {
		const link = encodeURIComponent(window.location.href);
		const url = `https://api.whatsapp.com/send?text=Join%20our%20DinnerDecider%20group!%20${link}`;
		window.open(url, "_blank", "noopener,noreferrer");
	}, []);

	return (
		<main className="min-h-[100svh] bg-gradient-to-br from-teal-50 to-pink-50 px-4 pt-24 pb-12">
			<div className="mx-auto max-w-3xl">
				<div className="flex items-center justify-between mb-2">
					<div className="text-teal-700 font-semibold">
						Group Code: <span className="font-mono tracking-widest">{code}</span>
					</div>
					<button
						className="rounded-lg bg-white px-3 py-1.5 border border-gray-300 hover:bg-teal-50"
						onClick={handleCopy}
					>
						Copy Link
					</button>
				</div>

				<div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600">
					<div>
						You are <span className="font-semibold text-teal-700">{displayName}</span>
					</div>
					<button
						onClick={handleNamePrompt}
						className="rounded-lg bg-white px-2.5 py-1 border border-gray-300 hover:bg-teal-50"
					>
						Edit name
					</button>
				</div>

				{participants.length > 0 ? (
					<div className="mb-3 text-xs text-gray-600">
						<span className="font-semibold text-teal-700">Active now ({participants.length}):</span>&nbsp;
						{participants.map((person) => person.name).join(", ")}
					</div>
				) : null}

				<div className="mb-4">
					<button
						onClick={handleInviteSMS}
						className="bg-teal-500 text-white rounded-lg px-4 py-2 m-1 hover:bg-teal-600 transition-all"
					>
						Invite via SMS
					</button>
					<button
						onClick={handleInviteWhatsApp}
						className="bg-teal-500 text-white rounded-lg px-4 py-2 m-1 hover:bg-teal-600 transition-all"
					>
						Invite via WhatsApp
					</button>
					<button
						onClick={handleCopy}
						className="bg-teal-500 text-white rounded-lg px-4 py-2 m-1 hover:bg-teal-600 transition-all"
					>
						Copy Link
					</button>
				</div>

						{winner ? (
					<div className="rounded-2xl bg-white shadow p-5">
						<h2 className="text-xl font-bold text-teal-700 mb-2">Winner</h2>
						<div className="grid gap-2">
							<div className="font-semibold">{winner.name}</div>
							<div className="text-yellow-600">Rating: {winner.rating}</div>
							<Image
								src={winner.photo || "/placeholder.jpg"}
								alt={winner.name}
								width={640}
								height={264}
								className="w-full h-44 object-cover rounded-xl"
								unoptimized
								priority
							/>
							<div className="text-gray-700">{winner.address}</div>
						</div>
					</div>
						) : session.restaurants.length === 0 ? (
							<div className="rounded-xl bg-white/90 backdrop-blur p-6 text-center text-gray-700 border border-dashed border-teal-200">
								<h2 className="text-lg font-semibold text-teal-700">Waiting on picks</h2>
								<p className="mt-2 text-sm">
									Start from the DinnerDecider dashboard, tap <span className="font-semibold">Let&apos;s Eat!</span>,
									and walk through Fetch → Randomize → Final picks. When you reach the results screen, the
									shortlist will sync here automatically for your group to vote.
								</p>
								<p className="mt-3 text-xs text-gray-500">
									Once restaurants are loaded, this screen will refresh with the voting cards. Keep this tab open while you generate the picks.
								</p>
							</div>
						) : (
					<>
						<div className="grid md:grid-cols-3 gap-4">
							{currentSlice.map((restaurant) => {
								const score = session.votes?.[restaurant.name] ?? 0;
								const positive = score > 0;
								const negative = score < 0;
								return (
									<div key={restaurant.name} className="rounded-xl bg-white shadow p-4 flex flex-col">
										<Image
											src={restaurant.photo || "/placeholder.jpg"}
											alt={restaurant.name}
											width={480}
											height={192}
											className="w-full h-32 object-cover rounded-lg mb-2"
											unoptimized
										/>
										<div className="font-semibold text-gray-900">{restaurant.name}</div>
										<div className="text-sm text-yellow-600">Rating: {restaurant.rating}</div>
										<div className="text-sm text-gray-600 line-clamp-2 mt-1">{restaurant.address}</div>
										<div className="mt-3 text-xs text-gray-500">
											Vote score:&nbsp;
											<span className={positive ? "text-emerald-600" : negative ? "text-rose-600" : "text-gray-700"}>
												{positive ? `+${score}` : score}
											</span>
										</div>
										<div className="mt-auto flex items-center gap-2 pt-3">
											<button
												onClick={() => handleVote(restaurant.name, +1)}
												className={`flex-1 rounded-lg px-3 py-2 transition ${positive ? "bg-emerald-200 text-gray-900" : "bg-emerald-100 text-gray-800 hover:bg-emerald-200"}`}
											>
												Like
											</button>
											<button
												onClick={() => handleVote(restaurant.name, -1)}
												className={`flex-1 rounded-lg px-3 py-2 transition ${negative ? "bg-rose-200 text-gray-900" : "bg-rose-100 text-gray-800 hover:bg-rose-200"}`}
											>
												Pass
											</button>
										</div>
									</div>
								);
							})}
						</div>

						<div className="mt-5 flex items-start justify-between flex-col md:flex-row gap-4">
							<div className="flex-1 text-sm text-gray-600">
								<div>Voting updates sync in realtime for this group.</div>
								{voteSnapshot.length > 0 ? (
									<ul className="mt-2 space-y-1 text-xs text-gray-500">
										{voteSnapshot.map((entry) => (
											<li key={entry.name} className="flex items-center justify-between gap-2">
												<span className="truncate">{entry.name}</span>
												<span className={entry.score > 0 ? "text-emerald-600" : entry.score < 0 ? "text-rose-600" : "text-gray-700"}>
													Score {entry.score > 0 ? `+${entry.score}` : entry.score}
												</span>
											</li>
										))}
									</ul>
								) : null}
							</div>
							<div className="flex items-center gap-2">
								<button
									className="rounded-lg bg-white px-3 py-2 border border-gray-300 hover:bg-teal-50"
									onClick={() => setPage((value) => Math.max(0, value - 1))}
								>
									Prev
								</button>
								<button
									className="rounded-lg bg-white px-3 py-2 border border-gray-300 hover:bg-teal-50"
									onClick={() =>
										setPage((value) =>
											(value + 1) * 3 < (session.restaurants?.length || 0) ? value + 1 : value
										)
									}
								>
									Next
								</button>
								<button
									className="rounded-lg bg-teal-600 text-white px-4 py-2 font-medium hover:bg-teal-700"
									onClick={handleFinalize}
								>
									Finalize Votes
								</button>
							</div>
						</div>
					</>
				)}
			</div>
			<div className="fixed top-2 right-2 bg-white/80 backdrop-blur rounded-full px-3 py-1 shadow text-sm">
				Timer: {formatTime(timeLeft)} remaining
			</div>
		</main>
	);
}
