'use strict';

const { humanClusterTitle } = require('./radar-score.cjs');

const PHASE_WHY = {
  emerging: 'The topic is gaining authors and velocity in this window.',
  accelerating: 'Velocity is rising faster than the recent baseline.',
  peak: 'Volume is high; the window looks saturated.',
  cooling: 'Velocity is falling versus the previous window.',
};

function affinityBand(affinity) {
  if (affinity >= 0.45) return 'high';
  if (affinity >= 0.2) return 'mid';
  return 'low';
}

function evidenceTitles(cluster) {
  return (cluster.evidence || [])
    .map((item) => humanClusterTitle(item.title, item.author?.name || item.provider || ''))
    .filter(Boolean)
    .slice(0, 3);
}

function enrichCluster(cluster, { affinity = 0, language = 'en' } = {}) {
  const titles = evidenceTitles(cluster);
  const whyNow = PHASE_WHY[cluster.phase] || PHASE_WHY.emerging;
  const whyForYou = affinity >= 0.45
    ? 'Matches topics you already publish or save.'
    : affinity >= 0.2
      ? 'Adjacent to your watchlists and recent posts.'
      : 'Weak local fit; useful as a contrast, not a default.';
  const claims = [
    {
      type: 'phase',
      text: `${cluster.title} is ${cluster.phase}`,
      evidenceIds: (cluster.evidence || []).map((item) => item.id).slice(0, 4),
    },
    titles.length > 0
      ? {
          type: 'evidence',
          text: `Cited pieces: ${titles.join(', ')}`,
          evidenceIds: (cluster.evidence || []).map((item) => item.id).slice(0, titles.length),
        }
      : null,
  ].filter(Boolean).filter((claim) => claim.evidenceIds.length > 0);

  const angles = [
    `Angle: what ${cluster.title} means for your audience this week.`,
    `Angle: contrast your last post with the ${cluster.phase} pattern.`,
  ];
  const structure = [
    'Hook with a concrete observation (not the cited title).',
    'Proof: one cited format or metric that actually exists.',
    'Ask or next step tied to your product.',
  ];

  return {
    ...cluster,
    whyNow,
    whyForYou,
    affinityBand: affinityBand(affinity),
    claims,
    creativeBrief: { angles, structure, language },
    summary: cluster.summary || whyNow,
  };
}

function enrichClusters(clusters, { affinityById = new Map(), language = 'en', topN = 8 } = {}) {
  return (clusters || []).map((cluster, index) => {
    if (index >= topN) return cluster;
    return enrichCluster(cluster, {
      affinity: affinityById.get(cluster.id) ?? cluster.affinity ?? 0,
      language,
    });
  });
}

module.exports = {
  enrichCluster,
  enrichClusters,
  affinityBand,
  PHASE_WHY,
};
