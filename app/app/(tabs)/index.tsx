import { useMemo } from 'react'
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Screen } from '../../src/ui/Screen'
import { Card, SectionTitle } from '../../src/ui/Card'
import { Txt } from '../../src/ui/Text'
import { Button } from '../../src/ui/Button'
import { usePalette } from '../../src/ui/ThemeProvider'
import { radius, space } from '../../src/ui/theme'
import { BackupBanner } from '../../src/components/BackupBanner'
import { NewsPlayer } from '../../src/components/NewsPlayer'
import { TodayMedicines } from '../../src/components/TodayMedicines'
import { QuickNotes } from '../../src/components/QuickNotes'
import { useIntakes, useMedicines, useTodayCache, useCarExpenses, useNotes } from '../../src/hooks/useData'
import { useSettingsQuery } from '../../src/hooks/useSettings'
import { useSync } from '../../src/hooks/useSync'
import { useToday } from '../../src/hooks/useToday'
import { medicinesForDay } from '../../src/lib/medicines'
import { eventsForDay, tasksForToday } from '../../src/lib/ical'
import { configFrom } from '../../src/lib/nextcloud'
import { clock, longDate, shortDate, whenFetched } from '../../src/lib/format'

/**
 * Lo que antes era el briefing de las 7:30 en Telegram: medicinas, tareas,
 * eventos y noticias de hoy, en una sola pantalla.
 */
export default function Hoy() {
  const day = useToday()
  const router = useRouter()
  const palette = usePalette()
  const sync = useSync()
  const { data: settings, ready: settingsReady } = useSettingsQuery()
  const meds = useMedicines()
  const intakes = useIntakes()
  const car = useCarExpenses()
  const cache = useTodayCache()
  const notes = useNotes()

  const todayMeds = useMemo(() => medicinesForDay(meds.data, intakes.data, day), [meds.data, intakes.data, day])
  // Con todas tomadas la tarjeta sobra: Hoy es para lo que queda por hacer.
  const pendingMeds = todayMeds.filter((t) => !t.taken)
  const tasks = useMemo(() => tasksForToday(cache.data?.value.tasks ?? [], day), [cache.data, day])
  const events = useMemo(() => eventsForDay(cache.data?.value.events ?? [], day), [cache.data, day])

  const configured = !!configFrom(settings)
  const itemCount = meds.data.length + car.data.length

  return (
    <Screen
      title={capitalize(longDate(day))}
      right={
        <Pressable
          onPress={() => router.navigate('/ajustes')}
          accessibilityRole="button"
          accessibilityLabel="Ajustes"
          hitSlop={10}
          style={({ pressed }) => [styles.gear, { borderColor: palette.muted, opacity: pressed ? 0.5 : 1 }]}
        >
          <View style={[styles.gearDot, { backgroundColor: palette.muted }]} />
        </Pressable>
      }
    >
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={sync.refreshing} onRefresh={sync.refresh} tintColor={palette.muted} colors={[palette.fg]} />}
      >
        <BackupBanner itemCount={itemCount} />

        {settingsReady && (!configured || !settings.notesImportedAt) ? (
          <Card>
            <Txt variant="section">{configured ? 'Trae tus datos del bot' : 'Conecta tu Nextcloud'}</Txt>
            <Txt variant="small" tone="muted">
              {configured
                ? 'Importa una vez los gastos del coche, las medicinas y las listas que guardaba el bot de Telegram.'
                : 'De ahí salen las tareas, los eventos y las noticias de esta pantalla, y ahí va la copia de seguridad.'}
            </Txt>
            <Button title="Ir a Ajustes" small onPress={() => router.navigate('/ajustes')} style={styles.selfStart} />
          </Card>
        ) : null}

        <Card>
          <SectionTitle title="Notas" />
          {notes.ready ? <QuickNotes notes={notes.data} day={day} /> : null}
        </Card>

        {meds.ready && intakes.ready && pendingMeds.length > 0 ? (
          <Card>
            <SectionTitle title="Medicinas" />
            <TodayMedicines items={pendingMeds} day={day} />
          </Card>
        ) : null}

        {configured ? (
          <Card>
            <SectionTitle
              title="Tareas"
              right={
                cache.data ? (
                  <Txt variant="data" tone="faint">
                    {whenFetched(cache.data.fetchedAt)}
                  </Txt>
                ) : null
              }
            />
            {!cache.ready ? null : !cache.data ? (
              <Txt variant="small" tone="muted">
                {sync.refreshing ? 'Cargando…' : 'Aún no se han podido traer. Desliza hacia abajo para reintentar.'}
              </Txt>
            ) : tasks.length === 0 ? (
              <Txt variant="small" tone="muted">
                Nada que venza hoy.
              </Txt>
            ) : (
              <View style={styles.list}>
                {tasks.map((t) => {
                  const late = t.due! < day
                  return (
                    <View key={t.uid} style={styles.item}>
                      <View style={[styles.bullet, { borderColor: late ? palette.warn : palette.muted }]} />
                      <View style={styles.itemText}>
                        <Txt variant="body">{t.title}</Txt>
                        <Txt variant="data" tone={late ? 'warn' : 'faint'}>
                          {late ? `Atrasada, vencía ${shortDate(t.due!, day)}` : t.dueTime ? `Hoy a las ${t.dueTime}` : 'Hoy'}
                          {` · ${t.calendar.replace(/^Deck: /, '')}`}
                        </Txt>
                      </View>
                    </View>
                  )
                })}
              </View>
            )}

            {cache.data ? (
              <>
                <SectionTitle title="Eventos" />
                {events.length === 0 ? (
                  <Txt variant="small" tone="muted">
                    Ninguno hoy.
                  </Txt>
                ) : (
                  <View style={styles.list}>
                    {events.map((e) => (
                      <View key={e.uid} style={styles.item}>
                        <Txt variant="data" tone="muted" style={styles.time}>
                          {e.allDay ? 'Todo el día' : clock(e.start)}
                        </Txt>
                        <Txt variant="body" style={styles.itemText}>
                          {e.title}
                        </Txt>
                      </View>
                    ))}
                  </View>
                )}
              </>
            ) : null}

            {sync.error ? (
              <Txt variant="small" tone="warn">
                {sync.error}
              </Txt>
            ) : null}
          </Card>
        ) : null}

        {configured ? (
          <Card>
            <SectionTitle title="Noticias" />
            {sync.news ? (
              <NewsPlayer news={sync.news} />
            ) : (
              <Txt variant="small" tone="muted">
                {sync.refreshing ? 'Descargando…' : 'La Pi aún no ha dejado noticias. Se generan cada mañana a las 7:30.'}
              </Txt>
            )}
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  )
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const styles = StyleSheet.create({
  content: { gap: space.lg, paddingBottom: space.xxl },
  list: { gap: space.md },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  itemText: { flex: 1, gap: 2 },
  bullet: { width: 12, height: 12, borderRadius: 3, borderWidth: 1.5, marginTop: 4 },
  time: { width: 72, paddingTop: 2 },
  selfStart: { alignSelf: 'flex-start' },
  // Engranaje geométrico: anillo con punto, sin librería de iconos.
  gear: { width: 22, height: 22, borderRadius: radius.pill, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  gearDot: { width: 6, height: 6, borderRadius: radius.pill },
})
