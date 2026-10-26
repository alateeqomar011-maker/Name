import { Link } from 'react-router-dom';
import { IStar8 } from '../components/Icons';
import { useI18n } from '../lib/i18n';

export function NotFound() {
  const { t } = useI18n();
  return (
    <div className="page">
      <div className="card empty">
        <IStar8 />
        <h2>404</h2>
        <Link className="btn" to="/">{t('nav_home')}</Link>
      </div>
    </div>
  );
}
