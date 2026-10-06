import { partyNames, shuffleParty } from './party-games-engine.js';
import { FRIENDSHIP_CONTENT } from './friendship-games-content.js';

export const FRIENDSHIP_ROUTES = Object.freeze({ impostor: 'secret-word-impostor', panic: 'panic-mode', court: 'friendship-court' });
export const friendshipPath = (game, lang = 'en') => lang === 'ar' ? `/ar/games/${FRIENDSHIP_ROUTES[game]}/` : `/${FRIENDSHIP_ROUTES[game]}`;
export function createFriendshipGame(game, names, rounds = 8, random = Math.random) {
  const players = partyNames(names);
  if (!Object.hasOwn(FRIENDSHIP_CONTENT, game) || ![5, 8, 10].includes(rounds)) throw Error('settings');
  const cards = shuffleParty(FRIENDSHIP_CONTENT[game], random).slice(0, rounds);
  if (cards.length < rounds) throw Error('content');
  return { game, players, cards, rounds, index: 0, viewer: 0, phase: game === 'impostor' ? 'secret' : 'card', votes: [], picks: [], scores: players.map(() => 0), imposter: game === 'impostor' ? Math.floor(random() * players.length) : null, accused: game === 'court' ? 0 : null, timer: 5, skipped: false, lastSuccess: null };
}
export function nextSecret(state) { if (state.phase !== 'secret') return false; state.viewer += 1; if (state.viewer >= state.players.length) { state.phase = 'clue'; state.viewer = 0; } return true; }
export function startFriendshipVote(state) { if (!['clue', 'card'].includes(state.phase)) return false; state.phase = 'handoff'; state.viewer = 0; state.votes = []; return true; }
export function readyFriendshipVoter(state) { if (state.phase !== 'handoff') return false; while (state.game === 'court' && state.viewer === state.accused) state.viewer += 1; if (state.viewer >= state.players.length) return false; state.phase = 'voting'; return true; }
export function castFriendshipVote(state, pick) {
  if (state.phase !== 'voting' || !Number.isInteger(pick) || pick < 0 || pick >= (state.game === 'court' ? 2 : state.players.length)) return false;
  state.votes.push({ voter: state.viewer, pick }); state.viewer += 1; state.phase = 'handoff';
  while (state.game === 'court' && state.viewer === state.accused) state.viewer += 1;
  if (state.viewer >= state.players.length) state.phase = 'reveal';
  return true;
}
export function finishPanic(state, success) { if (state.game !== 'panic' || state.phase !== 'judge') return false; state.lastSuccess = Boolean(success); if (state.lastSuccess) state.scores[state.index % state.players.length] += 1; state.phase = 'reveal'; return true; }
export function finishFriendshipRound(state) {
  if (state.phase !== 'reveal') return false;
  if (!state.skipped && state.game === 'impostor') { const guesses = state.votes.filter(v => v.pick === state.imposter).length; if (guesses <= state.players.length / 2) state.scores[state.imposter] += 2; }
  if (!state.skipped && state.game === 'court') { const guilty = state.votes.filter(v => v.pick === 0).length; const innocent = state.votes.length - guilty; if (innocent >= guilty) state.scores[state.accused] += 1; }
  state.index += 1; state.viewer = 0; state.votes = []; state.picks = []; state.timer = 5; state.skipped = false; state.lastSuccess = null;
  if (state.index >= state.cards.length) { state.phase = 'finished'; return true; }
  state.imposter = state.game === 'impostor' ? (state.imposter + 1) % state.players.length : null;
  state.accused = state.game === 'court' ? (state.accused + 1) % state.players.length : null;
  state.phase = state.game === 'impostor' ? 'secret' : 'card'; return true;
}
