import TextLink from '@/components/ui/TextLink';
import Button from '@/components/ui/Button';
import { useState } from 'react';
import Modal from '@/components/Modal';
import { analysesApi } from '@/lib/apiAnalyses';
import { useTranslation } from 'react-i18next';

import Card from '@/components/Card';
import HelpTip from '../HelpTip';
import ResultPill, { type MatchResult } from '@/components/ResultPill';
import { useJobAnalysis } from '@/hooks/useJobAnalysis';
import type { AnalysisTarget } from '@/lib/apiAnalyses';
import AnalysisStatus from './AnalysisStatus';

export default function ProfileMatch({
  target,
  refreshKey,
  legacy = [],
  onUpdated,
}: {
  target: AnalysisTarget;
  refreshKey?: string | number;
  legacy?: string[];
  onUpdated?: () => void;
}) {
  const { t } = useTranslation();
  const controller = useJobAnalysis('PROFILE_MATCH', target, refreshKey);
  const extraction = useJobAnalysis('EXTRACTION', target, refreshKey);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const { analysis, requirements, profile, busy, loading, running } =
    controller;
  const rows = analysis?.draft.rows ?? [];
  const disabled = busy || running || loading || saving;
  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          {t('ai.profileMatch')}{' '}
          <HelpTip label={t('ai.profileMatch')}>
            {t('ai.profileFooter')}
            {legacy.length > 0 && !requirements.length && (
              <span>
                {t('ai.notReviewed')}: {legacy.join(' · ')}
              </span>
            )}
          </HelpTip>
        </span>
      }
      icon="bi-person-check"
      actions={
        <>
          <TextLink to="/profile">{t('ai.openProfile')}</TextLink>
          {requirements.length > 0 && profile.length > 0 && (
            <Button
              type="button"
              className="flex items-center gap-1.5"
              disabled={disabled}
              title={disabled ? t('ai.loading') : undefined}
              onClick={() => void controller.run()}
            >
              <i className="bi-arrow-repeat mr-1" aria-hidden="true" />
              {t(analysis ? 'ai.runAgain' : 'ai.compare')}
            </Button>
          )}
        </>
      }
    >
      <AnalysisStatus controller={controller} />
      {!requirements.length && <AnalysisStatus controller={extraction} />}
      {!loading && !requirements.length && (
        <div className="mb-4">
          {legacy.length ? (
            <Button
              type="button"
              disabled={disabled}
              onClick={() => setConfirming(true)}
            >
              {t('ai.useRequirements')}
            </Button>
          ) : (
            <Button
              type="button"
              disabled={disabled || extraction.busy || extraction.running}
              onClick={async () => {
                await extraction.run();
                onUpdated?.();
              }}
            >
              {t('ai.extract')}
            </Button>
          )}
        </div>
      )}
      {!loading && !!requirements.length && !profile.length && (
        <p className="text-muted text-sm">{t('ai.profileFirst')}</p>
      )}
      {confirming && (
        <Modal
          onClose={() => setConfirming(false)}
          label={t('ai.useRequirements')}
          busy={saving}
        >
          <div className="bg-secondary mx-4 max-h-[80dvh] w-full max-w-lg overflow-y-auto rounded-lg p-6">
            <h2 className="mb-4 text-lg">{t('ai.useRequirements')}</h2>
            <ul className="mb-4 list-inside list-disc text-sm">
              {legacy.map((text, index) => (
                <li key={index}>{text}</li>
              ))}
            </ul>
            {controller.error && (
              <p role="alert" className="text-red mb-4 text-sm">
                {t('kit.saveFailed')}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                disabled={saving}
                onClick={() => setConfirming(false)}
              >
                {t('kit.cancel')}
              </Button>
              <Button
                variant="primary"
                type="button"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  controller.setError(false);
                  try {
                    await analysesApi.confirmRequirements(
                      target,
                      Number(refreshKey)
                    );
                    await controller.reload();
                    onUpdated?.();
                    setConfirming(false);
                  } catch {
                    controller.setError(true);
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {t('ai.useRequirements')}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {analysis?.stale && (
        <p
          role="status"
          className="text-yellow-bright bg-bg2 mb-4 rounded p-3 text-sm"
        >
          {t('ai.matchStale')}
        </p>
      )}
      {rows.length > 0 && (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {(
              [
                'confirmed',
                'partial',
                'no_evidence',
                'unknown',
              ] as MatchResult[]
            ).map((result) => (
              <ResultPill
                key={result}
                result={result}
                count={rows.filter((row) => row.state === result).length}
              />
            ))}
          </div>
          <div className="bg-bg2 overflow-hidden rounded-lg text-sm">
            <div className="text-muted hidden grid-cols-[1.1fr_1fr_1.3fr_1.1fr] gap-4 p-3 text-xs uppercase md:grid">
              {['requirement', 'result', 'evidence', 'why'].map((key) => (
                <span key={key}>{t(`ai.${key}`)}</span>
              ))}
            </div>
            {rows.map((row) => (
              <div
                key={row.requirement_id}
                className="border-bg3 grid grid-cols-1 gap-3 border-t p-3 md:grid-cols-[1.1fr_1fr_1.3fr_1.1fr]"
              >
                <div className="font-medium break-words">
                  {(analysis?.requirements ?? requirements).find(
                    (item) => item.id === row.requirement_id
                  )?.text ?? row.requirement_id}
                </div>
                <div>
                  <ResultPill result={row.state} />
                </div>
                <div className="min-w-0 text-xs break-words">
                  {row.evidence.length ? (
                    row.evidence.map((citation, index) => (
                      <div key={index} className="mb-2">
                        <TextLink
                          to={`/profile#${encodeURIComponent(citation.profile_id)}`}
                        >
                          {(() => {
                            const item = profile.find(
                              (item) => item.id === citation.profile_id
                            );
                            return item && item.id === item.name
                              ? t('accounts.' + item.id, {
                                  defaultValue: item.name,
                                }) +
                                  (item.id === 'years_experience'
                                    ? ': ' + Number(item.text)
                                    : '')
                              : (item?.name ?? t('ai.profileItem'));
                          })()}
                        </TextLink>
                        <blockquote className="border-accent text-muted mt-1 border-l pl-2 italic">
                          “
                          {citation.profile_id === 'years_experience'
                            ? Number(citation.quote)
                            : citation.quote}
                          ”
                        </blockquote>
                      </div>
                    ))
                  ) : (
                    <span className="text-muted">
                      {t(
                        row.state === 'no_evidence'
                          ? 'ai.noAllowedEvidence'
                          : 'ai.notEnoughData'
                      )}
                    </span>
                  )}
                </div>
                <p className="text-muted text-xs break-words">{row.why}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
