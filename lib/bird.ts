import "server-only";

import { TwitterClient, type TweetData } from "@steipete/bird";
import type { SourceItem } from "@/lib/types";
import { extractTweetId } from "@/lib/url";

function getClient(): TwitterClient {
  const authToken = process.env.AUTH_TOKEN;
  const ct0 = process.env.CT0;
  if (!authToken || !ct0) {
    throw new Error("Thiếu AUTH_TOKEN hoặc CT0 trên server.");
  }

  return new TwitterClient({
    cookies: {
      authToken,
      ct0,
      cookieHeader: `auth_token=${authToken}; ct0=${ct0}`,
      source: "environment",
    },
    timeoutMs: 15_000,
    quoteDepth: 1,
  });
}

function tweetUrl(tweet: TweetData): string {
  return `https://x.com/${tweet.author.username}/status/${tweet.id}`;
}

function toSourceItem(tweet: TweetData): SourceItem {
  return {
    author: `${tweet.author.name} (@${tweet.author.username})`,
    text: tweet.text,
    createdAt: tweet.createdAt,
    url: tweetUrl(tweet),
    likes: tweet.likeCount,
    replies: tweet.replyCount,
  };
}

function collectExpandedUrls(value: unknown, result: Set<string>): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectExpandedUrls(item, result);
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (
      ["expanded_url", "unwound_url", "url"].includes(key) &&
      typeof child === "string" &&
      /^https?:\/\//.test(child) &&
      !child.includes("x.com/") &&
      !child.includes("twitter.com/")
    ) {
      result.add(child);
    } else {
      collectExpandedUrls(child, result);
    }
  }
}

export async function readXThread(value: string): Promise<{
  title: string;
  authorContent: SourceItem[];
  communityContent: SourceItem[];
  authorLinks: string[];
}> {
  const tweetId = extractTweetId(value);
  const client = getClient();

  const [threadResult, repliesResult] = await Promise.all([
    client.getThreadPaged(tweetId, { includeRaw: true, maxPages: 2, pageDelayMs: 250 }),
    client.getRepliesPaged(tweetId, { includeRaw: true, maxPages: 2, pageDelayMs: 250 }),
  ]);

  if (!threadResult.success || !threadResult.tweets.length) {
    throw new Error(threadResult.success ? "Không đọc được thread X." : threadResult.error);
  }

  const target = threadResult.tweets.find((tweet) => tweet.id === tweetId) ?? threadResult.tweets[0];
  const authorId = target.authorId;
  const authorHandle = target.author.username;
  const authorTweets = threadResult.tweets
    .filter((tweet) => (authorId ? tweet.authorId === authorId : tweet.author.username === authorHandle))
    .slice(0, 40);

  const communityTweets = (repliesResult.success ? repliesResult.tweets : [])
    .filter((tweet) => (authorId ? tweet.authorId !== authorId : tweet.author.username !== authorHandle))
    .sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0))
    .slice(0, 40);

  const links = new Set<string>();
  for (const tweet of authorTweets) {
    collectExpandedUrls(tweet._raw, links);
    for (const match of tweet.text.matchAll(/https?:\/\/[^\s)]+/g)) {
      links.add(match[0]);
    }
  }

  return {
    title: `Thread của ${target.author.name} (@${authorHandle})`,
    authorContent: authorTweets.map(toSourceItem),
    communityContent: communityTweets.map(toSourceItem),
    authorLinks: [...links].slice(0, 8),
  };
}
