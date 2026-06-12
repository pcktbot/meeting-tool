import { and, desc, eq, gte, lte } from "drizzle-orm";
import { getDb, schema } from "../db";
import { getSetting, setSetting, SETTINGS } from "./settings";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";
const DEFAULT_SCAN_DAYS = 7;
const MAX_CHAT_MESSAGE_PAGES = 8;

export type TeamsChatMessage = typeof schema.teamsChatMessages.$inferSelect;

interface GraphCollection<T> {
  value: T[];
  "@odata.nextLink"?: string;
}

interface GraphUser {
  id: string;
  displayName?: string;
  userPrincipalName?: string;
}

interface GraphChat {
  id: string;
  chatType?: string;
  topic?: string | null;
  webUrl?: string | null;
}

interface GraphChatMessage {
  id: string;
  createdDateTime?: string;
  webUrl?: string | null;
  from?: {
    user?: {
      id?: string;
      displayName?: string | null;
    } | null;
  } | null;
  body?: {
    contentType?: string;
    content?: string | null;
  } | null;
}

export interface TeamsChatScanResult {
  imported: number;
  scannedChats: number;
  skippedChats: number;
  skippedMessages: number;
  me: {
    id: string;
    displayName: string;
  };
}

function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.body.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function isoDateForLocalDay(date: string, endOfDay = false): string {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(year, month - 1, day);
  if (endOfDay) value.setHours(23, 59, 59, 999);
  return value.toISOString();
}

function localDateFromIso(value: string): string {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - Math.max(0, days - 1));
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function graphFetch<T>(pathOrUrl: string, accessToken: string): Promise<T> {
  const url = pathOrUrl.startsWith("https://")
    ? pathOrUrl
    : `${GRAPH_BASE_URL}${pathOrUrl}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Microsoft Graph ${response.status}: ${body || response.statusText}`);
  }

  return response.json() as Promise<T>;
}

function isGraphForbiddenError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("Microsoft Graph 403");
}

export async function getTeamsChatScanDays(): Promise<string> {
  return (await getSetting(SETTINGS.TEAMS_CHAT_SCAN_DAYS)) ?? String(DEFAULT_SCAN_DAYS);
}

export async function setTeamsChatScanDays(days: string): Promise<void> {
  await setSetting(SETTINGS.TEAMS_CHAT_SCAN_DAYS, days);
}

export async function getTeamsChatAccessToken(): Promise<string | null> {
  return getSetting(SETTINGS.TEAMS_CHAT_ACCESS_TOKEN);
}

export async function setTeamsChatAccessToken(token: string): Promise<void> {
  await setSetting(SETTINGS.TEAMS_CHAT_ACCESS_TOKEN, token.trim());
}

export async function getTeamsChatLastScanAt(): Promise<string | null> {
  return getSetting(SETTINGS.TEAMS_CHAT_LAST_SCAN_AT);
}

async function listAllChats(accessToken: string): Promise<GraphChat[]> {
  const chats: GraphChat[] = [];
  let nextUrl: string | undefined = "/me/chats?$top=50";

  while (nextUrl) {
    const page: GraphCollection<GraphChat> = await graphFetch<GraphCollection<GraphChat>>(
      nextUrl,
      accessToken,
    );
    chats.push(...page.value);
    nextUrl = page["@odata.nextLink"];
  }

  return chats;
}

async function listRecentMessagesForChat(
  chat: GraphChat,
  accessToken: string,
  fromIso: string,
): Promise<GraphChatMessage[]> {
  const messages: GraphChatMessage[] = [];
  let nextUrl: string | undefined =
    `/chats/${encodeURIComponent(chat.id)}/messages?$top=50&$orderby=createdDateTime desc`;
  let pageCount = 0;

  while (nextUrl && pageCount < MAX_CHAT_MESSAGE_PAGES) {
    pageCount += 1;
    const page: GraphCollection<GraphChatMessage> =
      await graphFetch<GraphCollection<GraphChatMessage>>(nextUrl, accessToken);

    for (const message of page.value) {
      if (!message.createdDateTime) continue;
      if (message.createdDateTime < fromIso) {
        return messages;
      }
      messages.push(message);
    }

    nextUrl = page["@odata.nextLink"];
  }

  return messages;
}

export async function scanTeamsChats(days?: number): Promise<TeamsChatScanResult> {
  const accessToken = await getTeamsChatAccessToken();
  if (!accessToken) {
    throw new Error("Add a Microsoft Graph access token in Settings before scanning Teams chats.");
  }

  const scanDays = days ?? (Number(await getTeamsChatScanDays()) || DEFAULT_SCAN_DAYS);
  const fromIso = isoDateForLocalDay(dateDaysAgo(scanDays));
  const me = await graphFetch<GraphUser>("/me", accessToken);
  const chats = await listAllChats(accessToken);
  const db = getDb();
  let imported = 0;
  let skippedChats = 0;
  let skippedMessages = 0;

  for (const chat of chats) {
    let messages: GraphChatMessage[] = [];
    try {
      messages = await listRecentMessagesForChat(chat, accessToken, fromIso);
    } catch (error) {
      if (isGraphForbiddenError(error)) {
        skippedChats += 1;
        continue;
      }
      throw error;
    }

    for (const message of messages) {
      const senderId = message.from?.user?.id;
      const html = message.body?.content ?? "";
      const bodyText = stripHtml(html);

      if (!senderId || senderId !== me.id || !bodyText) {
        skippedMessages += 1;
        continue;
      }

      const [record] = await db
        .insert(schema.teamsChatMessages)
        .values({
          graphMessageId: message.id,
          chatId: chat.id,
          chatType: chat.chatType ?? "unknown",
          chatTopic: chat.topic ?? null,
          chatWebUrl: chat.webUrl ?? null,
          messageWebUrl: message.webUrl ?? null,
          fromUserId: senderId,
          fromDisplayName: message.from?.user?.displayName ?? me.displayName ?? null,
          bodyText,
          bodyHtml: html || null,
          createdDateTime: message.createdDateTime ?? new Date().toISOString(),
          importedAt: new Date(),
        })
        .onConflictDoNothing({ target: schema.teamsChatMessages.graphMessageId })
        .returning();

      if (record) imported += 1;
    }
  }

  const lastScanAt = new Date().toISOString();
  await setSetting(SETTINGS.TEAMS_CHAT_LAST_SCAN_AT, lastScanAt);

  return {
    imported,
    scannedChats: chats.length,
    skippedChats,
    skippedMessages,
    me: {
      id: me.id,
      displayName: me.displayName ?? me.userPrincipalName ?? me.id,
    },
  };
}

export async function getTeamsChatMessagesForDate(
  date: string,
): Promise<TeamsChatMessage[]> {
  const db = getDb();
  return db
    .select()
    .from(schema.teamsChatMessages)
    .where(
      and(
        gte(schema.teamsChatMessages.createdDateTime, isoDateForLocalDay(date)),
        lte(schema.teamsChatMessages.createdDateTime, isoDateForLocalDay(date, true)),
      ),
    )
    .orderBy(desc(schema.teamsChatMessages.createdDateTime));
}

export async function linkTeamsMessageToContribution(
  messageId: string,
  contributionEntryId: string | null,
): Promise<TeamsChatMessage> {
  const db = getDb();
  const [record] = await db
    .update(schema.teamsChatMessages)
    .set({ contributionEntryId })
    .where(eq(schema.teamsChatMessages.id, messageId))
    .returning();
  return record;
}

export function formatTeamsMessageLocalDate(value: string): string {
  return localDateFromIso(value);
}
