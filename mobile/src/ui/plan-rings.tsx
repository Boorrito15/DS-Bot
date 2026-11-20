// The plan usage rings: three arcs inside each other, one per window the account's
// provider reports. Drawn from data only, so a source with no numbers shows why.
import { StyleSheet, Text, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { t } from './i18n.ts'
import { planPercent, planReason, planReset, planWindows, type PlanSource, type PlanView } from '../team/plans.ts'
import { type as typeScale, useTheme } from './tokens.ts'

const SIZE = 78
const CENTER = SIZE / 2
const RADII = [31, 22, 13]
const STROKE = 5.5

function reasonText(source: PlanSource): string {
  const reason = planReason(source)
  if (reason === 'signed-out') return t('Not signed in on this computer')
  if (reason === 'unknown-shape') return t('Signed in, but the answer was not a shape DS Bot knows')
  if (reason === 'error') return `${t('Could not read it')}${source.error === undefined ? '' : `: ${source.error}`}`
  return ''
}

export function PlanRings({ view }: { view: PlanView | null }) {
  const { p } = useTheme()
  const paints = [p.accent, p.ink2, p.ink3]
  const sources = view?.sources ?? []
  if (sources.length === 0) return null
  return (
    <View style={{ marginTop: 16 }}>
      <Text style={[typeScale.caption, { color: p.ink3, paddingHorizontal: 18, marginBottom: 6, fontSize: 11 }]}>{t('Plan usage')}</Text>
      <View style={[styles.card, { backgroundColor: p.card, borderColor: p.line }]}>
        {sources.map((source, at) => {
          const windows = planWindows(source)
          const reason = reasonText(source)
          return (
            <View key={source.id} style={[styles.source, at > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.line }]}>
              <View style={styles.rings}>
                {windows.length > 0 ? <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
                  {windows.map((window, index) => {
                    const radius = RADII[index] ?? RADII[0]
                    const length = 2 * Math.PI * radius
                    const share = Math.max(0, Math.min(1, window.used ?? 0))
                    return (
                      <Circle key={window.id ?? index} cx={CENTER} cy={CENTER} r={radius} fill="none" stroke={p.line} strokeWidth={STROKE} />
                    )
                  })}
                  {windows.map((window, index) => {
                    const radius = RADII[index] ?? RADII[0]
                    const length = 2 * Math.PI * radius
                    const share = Math.max(0, Math.min(1, window.used ?? 0))
                    if (share <= 0) return null
                    return (
                      <Circle key={`on-${window.id ?? index}`} cx={CENTER} cy={CENTER} r={radius} fill="none" stroke={paints[index % paints.length]} strokeWidth={STROKE}
                        strokeLinecap="round" strokeDasharray={`${Math.max(0.5, length * share)} ${length}`} rotation={-90} origin={`${CENTER}, ${CENTER}`} />
                    )
                  })}
                </Svg> : null}
                {windows.length > 0 ? (
                  <Text style={[styles.big, { color: p.ink }]}>{planPercent(windows[0].used)}</Text>
                ) : null}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                  <Text style={[typeScale.settingsRow, { color: p.ink, fontWeight: '600' }]} numberOfLines={1}>{source.name ?? source.id}</Text>
                  {source.plan !== undefined ? <Text style={[typeScale.small, { color: p.ink3 }]} numberOfLines={1}>{source.plan}</Text> : null}
                </View>
                {windows.length > 0 ? windows.map((window, index) => (
                  <View key={window.id ?? index} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                    <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: paints[index % paints.length] }} />
                    <Text style={[typeScale.small, { color: p.ink2, minWidth: 62 }]}>{t(window.label ?? window.id ?? '')}</Text>
                    <Text style={[typeScale.small, { color: p.ink, fontWeight: '600' }]}>{planPercent(window.used)}</Text>
                    {window.resetsAt !== undefined ? (
                      <Text style={[typeScale.small, { color: p.ink3 }]}>{t('resets in {time}', { time: planReset(window.resetsAt) })}</Text>
                    ) : null}
                  </View>
                )) : (
                  <Text style={[typeScale.small, { color: p.ink3, marginTop: 3 }]} numberOfLines={3}>{reason}</Text>
                )}
              </View>
            </View>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 14, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  source: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingVertical: 12 },
  rings: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  big: { position: 'absolute', fontSize: 14, fontWeight: '600' },
})
