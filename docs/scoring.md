# Scoring walkthrough

How the per-colonia scores in `data/output/conoce_tu_colonia.geojson` are
computed, with worked examples and the knobs you'd touch to change them.
All scoring lives in [`scripts/07_compute_scores.py`](../scripts/07_compute_scores.py);
this doc is its narrative companion.

Sub-scores are 0–100, **higher = better**. Five exist:
`score_safety`, `score_transit`, `score_urban`, `score_development`,
`score_affordability`. The first four are weighted into `score_overall`;
affordability is standalone (cost is good for renters, bad for owners).

---

## `score_safety`

### Formula

```
street_density   = crime_street_last12mo  / area_km²
violent_density  = crime_violent_last12mo / area_km²

street_rank      = percentile-rank(street_density)    # 0 = lowest, 1 = highest
violent_rank     = percentile-rank(violent_density)

composite        = 0.4 × street_rank + 0.6 × violent_rank
score_safety     = (1 − composite) × 100              # invert: high crime → low score
```

### Design choices baked in

- **Density, not raw counts.** Doctores (2.5 km²) shouldn't look worse than
  San Rafael (1.05 km²) just for being bigger. Dividing by `area_km²`
  normalises.
- **`crime_street` = total − fraud − domestic.** Fraud / extortion /
  identity cases are filed at corporate or contract addresses; domestic
  violence happens at home. Neither is a signal of pedestrian street
  risk, and both inflate density in commercial colonias (Anzures,
  Juárez, Polanco). Filed in [`scripts/03_process_crime.py`](../scripts/03_process_crime.py)
  as the `tag_street` complement.
- **Percentile rank, not z-score or raw density.** FGJ has a heavy long
  tail (Centro and a few others sit 5σ above the mean). Percentile rank
  is robust — extreme outliers don't compress the rest of the
  distribution.
- **Violent weighted 0.6, street 0.4.** "Delito de bajo impacto" is
  ~81% of all carpetas. Without violent's higher weight, severity is
  drowned out by pickpocket volume.

### Worked examples

Three contrasting colonias from the current dataset. Citywide reference
distribution: street median ~182 /km², p90 ~393 /km²; violent median
~3 /km², p90 ~14 /km².

| Colonia | Area (km²) | Street crimes (12mo) | Violent crimes | Street density | Violent density |
|---|---:|---:|---:|---:|---:|
| Polanco V Sección (MH) | 1.06 | 433 | 3 | 409 /km² | 2.8 /km² |
| San Rafael (Cuauhtémoc) | 1.05 | 493 | 7 | 469 /km² | 6.7 /km² |
| Doctores (Cuauhtémoc) | 2.49 | 2,429 | 32 | 974 /km² | 12.8 /km² |

#### Polanco V Sección → 34.7

```
street_rank   = 0.913   (worse than 91% of colonias on street density)
violent_rank  = 0.479   (right at the citywide median for violent)
composite     = 0.4 × 0.913 + 0.6 × 0.479 = 0.365 + 0.287 = 0.653
score_safety  = (1 − 0.653) × 100 = 34.7
```

Polanco *feels* safe because violent crime is moderate, but the absolute
volume of low-impact theft / robbery in that 1 km² is high — wealthy
commercial zone with a lot of victimisation surface. The 60/40
weighting keeps it from scoring much worse.

#### San Rafael → 20.5

```
street_rank   = 0.945
violent_rank  = 0.695
composite     = 0.4 × 0.945 + 0.6 × 0.695 = 0.378 + 0.417 = 0.795
score_safety  = (1 − 0.795) × 100 = 20.5
```

Same area as Polanco, comparable street density, but **2× the violent
density** (6.7 vs 2.8). Violent rank jumps from p48 to p70, and because
it carries the 0.6 weight, that drives the 14-point gap.

#### Doctores → 7.7

```
street_rank   = 0.995   (worse than 99.5% of colonias)
violent_rank  = 0.875
composite     = 0.4 × 0.995 + 0.6 × 0.875 = 0.398 + 0.525 = 0.923
score_safety  = (1 − 0.923) × 100 = 7.7
```

Larger polygon (2.5 km²) and *much* higher density on both — 2× the
street rate of San Rafael and ~2× the violent rate. Near the bottom of
the citywide distribution.

### How to read a safety score

Useful intuition: `score_safety ≈ percentile of "how safe is this
colonia"`, weighted toward violent crime.

So San Rafael at 20.5 means roughly *"safer than the bottom 20% of CDMX
colonias, worse than the top 80%"*. That's why a comfortable, walkable
neighborhood can still score in the teens — percentile rank is
relative, and CDMX's safest colonias really are quiet (peripheral
Coyoacán, Magdalena Contreras hill colonias).

### Knobs

If you want to change behaviour, here's what to touch:

| Knob | Where | Effect of changing it |
|---|---|---|
| Violent / street weight (0.6 / 0.4) | `safety_score` in `07_compute_scores.py` | Push the score toward severity (raise violent) or toward volume (raise street). |
| What counts as "street" | `tag_street` in `03_process_crime.py` (currently `total − fraud − domestic`) | Adding e.g. `threats` to the exclusion list would further isolate physical street risk; removing `domestic` would re-inflate dense central colonias. |
| What counts as "violent" | `TAG_RULES["violent"]` regex in `03_process_crime.py` | Currently homicidio doloso, feminicidio, lesiones dolosas, violación, secuestro. Adding `ROBO ... CON VIOLENCIA` would shift volume into the violent bucket. |
| Density vs per-capita | `safety_score` divides by `area_km²` | Switching to per-1,000-residents requires solving the per-colonia population problem first (see *Pipeline improvements* in the README). |
| Window length | `lo` / `hi` in `aggregate_window` (`03_process_crime.py`) | Defaults to 12mo + prior 12mo for trend. Shortening to 6mo would react faster to trend changes; lengthening reduces noise in low-crime colonias. |
| Rank → score mapping | `(1 − composite) × 100` | Linear today. A non-linear mapping (e.g. `(1 − composite²) × 100`) would compress mid-range scores and make only the very-worst colonias look red. |

### What this score does **not** capture

- **Time of day / day of week.** Centro at 11am vs 11pm is not the same
  place. The aggregation is annual.
- **Perceived safety.** Lighting quality, abandoned-lot density, pedestrian
  flow — none of these are in the pipeline. `pedestrian_infra_score`
  (in the urban dimension) is the closest proxy.
- **Reporting bias.** Wealthier colonias report more (they call
  ministerio público); poorer colonias under-report. FGJ counts are
  *reported* crime, not actual crime. This is a known limitation of all
  carpetas-based analysis.
- **Crime type mix beyond street/violent.** A colonia with high
  `crime_drugs` but low everything else still scores well — narcomenudeo
  is not in either bucket. The granular tag columns are exposed in the
  schema for users who want to slice further.
