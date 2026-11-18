// A test slope only. This fixture is served in memory and never published.
module.exports = function fixture() {
  const cols = 81, rows = 81;
  return {
    version: 1, id: 'alpe-dhuez', elevationSource: 'Synthetic test fixture',
    grid: {
      east: 100, north: 1000, step: 10, cols, rows,
      heights: Array.from({ length: cols * rows }, (_, i) =>
        2800 - Math.floor(i / cols) * 3 + (i % cols) * 0.25),
    },
    piste: { name: 'Test piste', osmWay: 1, points: [[500, 850], [505, 730], [500, 450]] },
  };
};
