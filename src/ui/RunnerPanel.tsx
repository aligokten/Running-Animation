import type { ActivityKind, RunnerInfo } from '../types';
import { Field, Panel, Segmented, TextInput, Toggle } from './controls';

export function RunnerPanel({
  runner,
  onChange,
}: {
  runner: RunnerInfo;
  onChange: (next: RunnerInfo) => void;
}) {
  const set = <K extends keyof RunnerInfo>(key: K, value: RunnerInfo[K]) =>
    onChange({ ...runner, [key]: value });

  const isRace = runner.kind === 'race';

  return (
    <Panel
      title="Koşucu ve etkinlik"
      hint="Videoda görünecek künye bilgileri. Hepsi isteğe bağlı."
    >
      <Field label="Etkinlik türü">
        <Segmented<ActivityKind>
          value={runner.kind}
          onChange={(v) => set('kind', v)}
          options={[
            { value: 'training', label: 'Antrenman' },
            { value: 'race', label: 'Yarış' },
          ]}
        />
      </Field>

      <Field label="Koşucu adı">
        <TextInput
          value={runner.athlete}
          onChange={(v) => set('athlete', v)}
          placeholder="Ad Soyad"
        />
      </Field>

      {isRace ? (
        <>
          <Field label="Yarış adı" hint="başlık olarak kullanılır">
            <TextInput
              value={runner.raceName}
              onChange={(v) => set('raceName', v)}
              placeholder="İstanbul Maratonu"
            />
          </Field>
          <div className="grid-2">
            <Field label="Göğüs no">
              <TextInput value={runner.bib} onChange={(v) => set('bib', v)} placeholder="1453" />
            </Field>
            <Field label="Derece" hint="opsiyonel">
              <TextInput
                value={runner.placing}
                onChange={(v) => set('placing', v)}
                placeholder="12/430"
              />
            </Field>
          </div>
          <div className="grid-2">
            <Field label="Kategori">
              <TextInput
                value={runner.category}
                onChange={(v) => set('category', v)}
                placeholder="E35-39"
              />
            </Field>
            <Field label="Kulüp / takım">
              <TextInput value={runner.club} onChange={(v) => set('club', v)} placeholder="—" />
            </Field>
          </div>
        </>
      ) : (
        <div className="grid-2">
          <Field label="Kulüp / takım">
            <TextInput value={runner.club} onChange={(v) => set('club', v)} placeholder="—" />
          </Field>
          <Field label="Kategori" hint="opsiyonel">
            <TextInput
              value={runner.category}
              onChange={(v) => set('category', v)}
              placeholder="Tempo koşusu"
            />
          </Field>
        </div>
      )}

      <Field label="Yer" hint="alt başlıkta görünür">
        <TextInput
          value={runner.location}
          onChange={(v) => set('location', v)}
          placeholder="İstanbul"
        />
      </Field>

      <div className="toggles">
        <Toggle
          label="Künyeyi videoda göster"
          checked={runner.show}
          onChange={(v) => set('show', v)}
        />
      </div>
    </Panel>
  );
}
