/**
 * Thin fetch helpers for the in-process HTTP calls (skills.sh, GitHub). They
 * centralize the timeout default and the non-2xx error wording; the caller
 * injects the transport (global `fetch` or Electron's proxy-aware `net.fetch`).
 */
import type { FetchLike, FetchLikeInit, FetchLikeResponse } from './cli/remote-search.js';

const DEFAULT_TIMEOUT_MS = 15_000;

export interface FetchOptions {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  init?: FetchLikeInit;
}

/** Fetch a response with a timeout, honoring a caller-supplied signal. */
export async function fetchResponse(
  url: string,
  options: FetchOptions = {},
): Promise<FetchLikeResponse> {
  const { fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS, init } = options;
  return fetchImpl(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(timeoutMs) });
}

/** Fetch JSON, throwing a labelled error on a non-2xx status. */
export async function fetchJson<T>(
  url: string,
  label: string,
  options: FetchOptions = {},
): Promise<T> {
  const response = await fetchResponse(url, options);
  if (!response.ok) throw new Error(`${label} responded with ${response.status}`);
  return (await response.json()) as T;
}
