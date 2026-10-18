import { type FormEvent, useState } from 'react';
import { Link } from 'react-router';
import { applyCategoryTemplate, createCategory, updateCategory } from '../../data/actions';
import { db } from '../../data/db';
import { useCategories } from '../../data/repos';
import { categoryTemplate } from '../../domain/category-template';
import type { Category } from '../../domain/model';
import { t, useLang } from '../../i18n/t';
import { type CategoryIconKey, categoryIcons } from '../../icons/category-icons';
import { ArrowDownIcon, ArrowUpIcon, EditIcon } from '../../icons/ui-icons';
import { Button, Card, CategoryTile, Dialog, TextField } from '../../ui';
import styles from './CategoriesPage.module.css';

const COLORS = [...new Set(categoryTemplate.map((c) => c.color))];
const ICONS = Object.keys(categoryIcons) as CategoryIconKey[];

interface Draft {
  id: string | null;
  name: string;
  color: string;
  icon: string;
}

export function CategoriesPage() {
  const lang = useLang();
  const categories = useCategories().filter((c) => !c.deleted);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startNew = () => {
    setError(null);
    setDraft({ id: null, name: '', color: COLORS[0] ?? '#2F7D4F', icon: 'sonstiges' });
  };
  const startEdit = (c: Category) => {
    setError(null);
    setDraft({ id: c.id, name: c.name, color: c.color, icon: c.icon });
  };

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    if (!draft.name.trim()) return setError(t('categories.nameRequired'));
    if (draft.id) {
      await updateCategory(db, draft.id, {
        name: draft.name,
        color: draft.color,
        icon: draft.icon,
      });
    } else {
      const sort = categories.reduce((m, c) => Math.max(m, c.sort), -10) + 10;
      await createCategory(db, {
        name: draft.name,
        color: draft.color,
        icon: draft.icon,
        sort,
        hidden: false,
      });
    }
    setDraft(null);
  }

  /** Tauscht die Sortierwerte zweier benachbarter Kategorien. */
  async function move(index: number, dir: -1 | 1) {
    const a = categories[index];
    const b = categories[index + dir];
    if (!a || !b) return;
    if (a.sort === b.sort) {
      await updateCategory(db, a.id, { sort: b.sort + dir });
      return;
    }
    await updateCategory(db, a.id, { sort: b.sort });
    await updateCategory(db, b.id, { sort: a.sort });
  }

  return (
    <div className={styles.page}>
      <div className={styles.bar}>
        <Link to="/einstellungen" className={styles.link}>
          {t('categories.back')}
        </Link>
      </div>
      <h1 className="type-large-title">{t('categories.title')}</h1>
      <p className={styles.muted}>{t('categories.hint')}</p>

      {categories.length === 0 ? (
        <div className={styles.empty}>
          <p>{t('categories.empty')}</p>
          <Button onClick={() => void applyCategoryTemplate(db, categoryTemplate, lang)}>
            {t('categories.template')}
          </Button>
        </div>
      ) : (
        <Card className={styles.list}>
          {categories.map((c, i) => (
            <div key={c.id} className={`${styles.row} ${c.hidden ? styles.hidden : ''}`}>
              <CategoryTile icon={c.icon} color={c.color} size={36} />
              <span className={styles.name}>
                {c.name}
                {c.hidden ? <span className={styles.badge}>{t('categories.hidden')}</span> : null}
              </span>
              <div className={styles.tools}>
                <button
                  type="button"
                  className={styles.iconBtn}
                  aria-label={`${t('categories.up')}: ${c.name}`}
                  disabled={i === 0}
                  onClick={() => void move(i, -1)}
                >
                  <ArrowUpIcon size={18} />
                </button>
                <button
                  type="button"
                  className={styles.iconBtn}
                  aria-label={`${t('categories.down')}: ${c.name}`}
                  disabled={i === categories.length - 1}
                  onClick={() => void move(i, 1)}
                >
                  <ArrowDownIcon size={18} />
                </button>
                <button
                  type="button"
                  className={styles.iconBtn}
                  aria-label={`${t('categories.edit')}: ${c.name}`}
                  onClick={() => startEdit(c)}
                >
                  <EditIcon size={18} />
                </button>
                <button
                  type="button"
                  className={styles.textBtn}
                  onClick={() => void updateCategory(db, c.id, { hidden: !c.hidden })}
                  aria-label={`${c.hidden ? t('categories.show') : t('categories.hide')}: ${c.name}`}
                >
                  {c.hidden ? t('categories.show') : t('categories.hide')}
                </button>
              </div>
            </div>
          ))}
        </Card>
      )}
      <Button variant="secondary" onClick={startNew}>
        {t('categories.add')}
      </Button>

      <Dialog
        open={draft !== null}
        title={draft?.id ? t('categories.edit') : t('categories.add')}
        onClose={() => setDraft(null)}
      >
        {draft ? (
          <form onSubmit={(e) => void save(e)} noValidate className={styles.form}>
            <TextField
              label={t('categories.name')}
              value={draft.name}
              maxLength={60}
              autoComplete="off"
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              error={error ?? undefined}
            />
            <fieldset className={styles.fieldset}>
              <legend>{t('categories.color')}</legend>
              <div className={styles.swatches}>
                {COLORS.map((color, i) => (
                  <button
                    key={color}
                    type="button"
                    className={styles.swatch}
                    style={{ background: color }}
                    aria-pressed={draft.color === color}
                    aria-label={`${t('categories.color')} ${i + 1}`}
                    onClick={() => setDraft({ ...draft, color })}
                  />
                ))}
              </div>
            </fieldset>
            <fieldset className={styles.fieldset}>
              <legend>{t('categories.icon')}</legend>
              <div className={styles.swatches}>
                {ICONS.map((icon, i) => {
                  const Icon = categoryIcons[icon];
                  return (
                    <button
                      key={icon}
                      type="button"
                      className={styles.iconPick}
                      aria-pressed={draft.icon === icon}
                      aria-label={`${t('categories.icon')} ${i + 1}`}
                      onClick={() => setDraft({ ...draft, icon })}
                    >
                      <Icon size={20} />
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <div className={styles.actions}>
              <Button type="submit">{t('common.save')}</Button>
              <Button variant="secondary" onClick={() => setDraft(null)}>
                {t('common.cancel')}
              </Button>
            </div>
          </form>
        ) : null}
      </Dialog>
    </div>
  );
}
