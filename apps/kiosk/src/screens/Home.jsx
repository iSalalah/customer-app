import { useNavigate } from 'react-router-dom';

import { useI18n } from '../i18n/index.js';
import { useSession } from '../session/SessionProvider.jsx';
import { Screen, Tile } from '../components/index.jsx';

/**
 * Public landing screen.
 *
 * This is where every ended session lands, so it must render correctly with no
 * citizen state at all. The "session ended" notice is shown here rather than on
 * the screen the citizen was on, because that screen no longer exists.
 */
export default function Home() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { expiredNotice, dismissExpiredNotice, isAuthenticated } = useSession();

  const go = (path) => {
    dismissExpiredNotice();
    navigate(path);
  };

  return (
    <Screen title={t('home.heading')} lead={t('home.lead')}>
      {expiredNotice && (
        <div className="panel panel--info" role="status" style={{ marginBottom: 'var(--sp-4)' }}>
          {t('idle.expired')}
        </div>
      )}

      <div className="grid-cards">
        <Tile
          title={t('home.newRequest')}
          hint={t('home.newRequestHint')}
          onClick={() => go(isAuthenticated ? '/new' : '/login?next=/new')}
        />
        <Tile
          title={t('home.login')}
          hint={t('home.loginHint')}
          onClick={() => go(isAuthenticated ? '/dashboard' : '/login')}
        />
        <Tile title={t('home.track')} hint={t('home.trackHint')} onClick={() => go('/track')} />
      </div>

      <section className="panel" style={{ marginTop: 'var(--sp-5)' }} aria-labelledby="privacy-heading">
        <h2 id="privacy-heading" style={{ fontSize: 'var(--fs-lg)' }}>
          {t('home.privacyTitle')}
        </h2>
        <p style={{ margin: 0 }}>{t('home.privacyBody')}</p>
      </section>
    </Screen>
  );
}
