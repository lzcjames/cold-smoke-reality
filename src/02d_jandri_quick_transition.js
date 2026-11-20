// Browser-side adapter for a FUTURE source-approved Jandri quick ride.
// This module does not wire any UI control, create cabins, or authorize teleport.
const JandriQuickTransition = (() => {
  let busy = false;
  const destinations = new Set(['jandri-2600', 'jandri-3200']);

  function checkPlan(plan) {
    const a = plan?.arrival;
    if (plan?.type !== 'jandri_verified_quick_arrival' ||
        plan.season !== 'winter' || !destinations.has(plan.destination) ||
        plan.mode !== 'express_to_terminal' ||
        plan.needsCabinAnimation !== false || plan.needsLiftPhysics !== false ||
        plan.transitionMs !== 1800 ||
        !a || a.source !== 'verified_lift_top_terminal' ||
        typeof a.stationId !== 'string' || !a.stationId ||
        ![a.x, a.y, a.z].every(Number.isFinite))
      throw new Error('Jandri quick travel requires a verified arrival plan');
  }

  // The caller is responsible for independently authenticated DEM, terrain
  // collision, station exit and piste-access checks. Never infer a landing
  // from printed station altitude, a map centreline or UI selection alone.
  async function run(plan, hooks) {
    if (busy) throw new Error('Jandri quick travel is already in progress');
    checkPlan(plan);
    const required = ['authorizePlan', 'loadDestination', 'validateArrival', 'cover',
      'placePlayer', 'reveal', 'rollback'];
    if (!hooks || required.some(k => typeof hooks[k] !== 'function'))
      throw new Error('Jandri quick travel needs a complete safe transition adapter');

    busy = true;
    let coverAttempted = false;
    let covered = false;
    let attemptedPlacement = false;
    try {
      // Shape checks are not provenance. An independent source-backed
      // authorization gate must approve this exact plan before any download,
      // visual transition or mutation of the skier position.
      if (await hooks.authorizePlan(plan) !== true)
        throw new Error('Jandri quick travel plan is not source-authorized');
      // Loading and verifying happen BEFORE the player's position changes.
      const terrain = await hooks.loadDestination(plan);
      if (await hooks.validateArrival(plan, terrain) !== true)
        throw new Error('Jandri destination terrain/spawn is not verified');
      coverAttempted = true;
      await hooks.cover(plan.transitionMs);
      covered = true;
      attemptedPlacement = true;
      await hooks.placePlayer(plan, terrain);
      await hooks.reveal(plan.transitionMs);
      covered = false;
      return Object.freeze({status:'arrived', destination:plan.destination,
        stationId:plan.arrival.stationId});
    } catch (error) {
      // If placement may have partially changed game state, restore it.
      if (attemptedPlacement) {
        try { await hooks.rollback(); }
        catch { /* preserve original failure, but never claim success */ }
      }
      if (coverAttempted) {
        try { await hooks.reveal(plan.transitionMs); }
        catch { /* preserve original failure */ }
      }
      throw error;
    } finally {
      busy = false;
    }
  }

  return Object.freeze({run, checkPlan, get busy() { return busy; }});
})();
