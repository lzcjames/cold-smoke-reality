# Petites Crêtes green piste — crossfall and playability correction

## Independent classification
The [Les Deux Alpes ski-area operator](https://www.skipass-2alpes.com/fr/domaine/domaine-skiable?season=winter) officially calls **Petites Crêtes** a green piste. Its game OSM way is `643745486`, already correctly tagged `novice` in the published source asset.

## Root cause
The authentic 15 m IGN LiDAR HD MNT ground model along the selected *OSM centreline* descends approximately 55 m over 618 m (8.8% average). However, sampling the natural MNT perpendicular to this line gives a **~50–56% local transverse slope** near vertices 18–21. Original game physics rendered the *unprepared hillside* at the centreline coordinates; a green centreline does not imply the raw hillside has the groomed piste's cross-section.

An additional gameplay confusion: opening Les Deux Alpes normally spawns on **Diable 1, an advanced/black OSM route**, not on green Petites Crêtes. Reaching the green route required a sharp fork. Playing on Diable 1 should not be conflated with skiing Petites Crêtes.

## Scoped fix
- Preserve the source DEM JSON, datum, OSM vertex geometry, directional junctions, ski labels and difficulty classification exactly.
- On **Petites Crêtes only**, derive a gameplay **simulated groomed snow surface** by limiting the lateral elevation difference to 7% of the distance from the nearest true OSM centreline point within the existing estimated 18 m half-width. Blend back to the unmodified natural MNT over the 18–34 m shoulder. Do *not* claim that this profile represents actually surveyed snowcat earthworks or legal piste widths.
- The renderer, terrain normal and ski collision sample **the same** simulated surface through `Course.height`; road signs and boundary markers are anchored to it as well. The raw `Reality.height` still returns unchanged source data.
- Add an explicit direct testing URL for the independently validated real piste, **`?reality=les-deux-alpes&network=1&piste=643745486`**. Without this opt-in the original route spawn is unchanged.
- Restrict the correction to resort ID `les-deux-alpes` and OSM way `643745486`. **Alpe d'Huez and the Diable/Vallons natural ground source are not reshaped.**

## Remaining limitations
The source is an MNT ground DEM, not a surveyed winter piste surface. Historical grading, exact maintained width and grooming practices can change. The present correction is a *gameplay approximation*, and its visual quality and actual device FPS must be validated separately. This is not an on-mountain safety or navigation product.
