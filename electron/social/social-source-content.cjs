'use strict';

// Normalize only display data, never credentials or raw provider responses.
function webUrl(value) {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? value : undefined;
  } catch { return undefined; }
}

function instagramContent(post, account) {
  const children = post.children?.data;
  const items = Array.isArray(children) && children.length ? children : [post];
  return {
    media: items.map((item) => ({
      type: item.media_type === 'VIDEO' ? 'video' : 'image',
      url: webUrl(item.media_url),
      thumbnailUrl: webUrl(item.thumbnail_url),
      externalId: item.id,
      alt: item.alt_text,
    })),
    source: {
      authorName: account.display_name || account.displayName || post.username,
      authorHandle: post.username || account.handle,
      format: post.media_product_type === 'REELS' ? 'reel' : post.media_type === 'CAROUSEL_ALBUM' ? 'carousel' : post.media_type === 'VIDEO' ? 'video' : 'image',
    },
  };
}

function xContent(post, includes = {}, account = {}) {
  const author = includes.users?.find((user) => user.id === post.author_id);
  const entities = post.note_tweet?.entities || post.entities;
  const link = entities?.urls?.find((url) => !url.media_key && !/https:\/\/t\.co\//.test(url.expanded_url || ''));
  const poll = includes.polls?.find((item) => post.attachments?.poll_ids?.includes(item.id));
  const quoteRef = post.referenced_tweets?.find((ref) => ref.type === 'quoted');
  const quote = includes.tweets?.find((item) => item.id === quoteRef?.id);
  const quotedAuthor = includes.users?.find((user) => user.id === quote?.author_id);
  return {
    media: (post.attachments?.media_keys || []).map((key) => {
      const media = includes.media?.find((item) => item.media_key === key) || {};
      const variants = (media.variants || []).filter((v) => v.content_type === 'video/mp4');
      variants.sort((a, b) => (b.bit_rate || 0) - (a.bit_rate || 0));
      return {
        type: media.type === 'photo' ? 'image' : 'video',
        url: webUrl(media.url || variants[0]?.url),
        thumbnailUrl: webUrl(media.preview_image_url),
        externalId: key,
        alt: media.alt_text,
        width: media.width,
        height: media.height,
        durationMs: media.duration_ms,
      };
    }),
    linkUrl: webUrl(link?.unwound_url || link?.expanded_url),
    source: {
      authorName: author?.name || account.display_name || account.displayName,
      authorHandle: author?.username || account.handle,
      avatarUrl: webUrl(author?.profile_image_url),
      format: poll ? 'poll' : undefined,
      link: link ? { title: link.title, description: link.description, imageUrl: webUrl(link.images?.[0]?.url) } : undefined,
      poll: poll ? { options: poll.options, endsAt: poll.end_datetime, status: poll.voting_status } : undefined,
      quote: quote ? { body: quote.note_tweet?.text || quote.text, authorName: quotedAuthor?.name, authorHandle: quotedAuthor?.username, url: `https://x.com/i/status/${quote.id}` } : undefined,
    },
  };
}

function linkedinMediaType(id) {
  if (/:video:/.test(id || '')) return 'video';
  if (/:document:/.test(id || '')) return 'document';
  return 'image';
}

async function linkedinAttachment(item, resolveAsset) {
  const id = item.id || item.media;
  let asset = {};
  if (id && /^urn:li:(image|video|document):/.test(id)) {
    try {
      asset = await resolveAsset(id);
    } catch {
      /* retain attachment and show source fallback */
    }
  }
  return {
    externalId: id,
    type: linkedinMediaType(id),
    url: webUrl(asset.downloadUrl || item.originalUrl),
    thumbnailUrl: webUrl(asset.thumbnail || item.thumbnails?.[0]?.url),
    alt: item.altText || asset.altText,
    name: item.title?.text || item.title,
    width: asset.aspectRatioWidth,
    height: asset.aspectRatioHeight,
  };
}

async function linkedinArticleImage(article, resolveAsset) {
  if (!article?.thumbnail) return undefined;
  try {
    return webUrl((await resolveAsset(article.thumbnail)).downloadUrl);
  } catch {
    return undefined;
  }
}

function linkedinFormat(content) {
  if (content.article) return 'article';
  if (content.multiImage) return 'carousel';
  if (content.poll) return 'poll';
  return undefined;
}

function linkedinPollOption(option, index) {
  return {
    position: index + 1,
    label: option.text,
    votes: option.voteCount,
  };
}

function linkedinPoll(pollContent) {
  if (!pollContent) return undefined;
  return {
    question: pollContent.question,
    options: (pollContent.options || []).map(linkedinPollOption),
    status: pollContent.votingStatus,
  };
}

async function linkedinContent(post, account, resolveAsset) {
  const content = post.content || {};
  const legacy = post.specificContent?.['com.linkedin.ugc.ShareContent'];
  const attachments = content.multiImage?.images || (content.media ? [content.media] : legacy?.media || []);
  const media = [];
  for (const item of attachments) {
    media.push(await linkedinAttachment(item, resolveAsset));
  }
  const article = content.article;
  const articleImage = await linkedinArticleImage(article, resolveAsset);
  return {
    media,
    linkUrl: webUrl(article?.source || legacy?.media?.find((item) => item.originalUrl)?.originalUrl),
    source: {
      authorName: account.display_name || account.displayName,
      authorHandle: account.handle,
      format: linkedinFormat(content),
      link: article ? { title: article.title, description: article.description, imageUrl: articleImage } : undefined,
      poll: linkedinPoll(content.poll),
    },
  };
}

module.exports = { instagramContent, xContent, linkedinContent };
