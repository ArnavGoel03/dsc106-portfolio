"""Offline regressions for exact sampled counts and failed-download coverage."""
import ast
from concurrent.futures import ThreadPoolExecutor
from contextlib import redirect_stderr, redirect_stdout
from datetime import datetime, timedelta
import gzip
from io import StringIO
import json
import os
from pathlib import Path
import sys
import tempfile
import time
from types import SimpleNamespace
import unittest
from unittest.mock import Mock

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import config as C
from export_web import load_grid, season_grids


def fetch_function(name, namespace):
    """Load one function without initializing an AWS client or making network calls."""
    tree = ast.parse((ROOT / "scripts" / "fetch_glm.py").read_text())
    node = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == name)
    exec(compile(ast.Module(body=[node], type_ignores=[]), str(ROOT / "scripts" / "fetch_glm.py"), "exec"), namespace)
    return namespace[name]


class ExportedCountsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads((ROOT / "web" / "data" / "glm.json").read_text())
        cls.meta = cls.data["meta"]
        cls.source, _ = load_grid()
        seasons = season_grids(cls.source)
        cls.means = np.stack([np.stack([seasons[s][clock] for clock in cls.meta["clocks"]]) for s in C.SEASONS])
        cls.raw_bytes = (ROOT / cls.meta["counts_file"]).read_bytes()
        cls.raw = np.frombuffer(cls.raw_bytes, dtype="<u2").reshape(cls.means.shape)
        cls.divisor = cls.meta.get("counts_divisor", 1)

    def test_export_preserves_every_source_count(self):
        np.testing.assert_allclose(self.raw / self.divisor, self.means, rtol=0, atol=1e-10)
        self.assertEqual(self.divisor, len(C.YEARS))
        self.assertEqual(self.meta["counts_file"], "web/data/glm_counts_sums.bin")

    def test_clocks_preserve_cell_and_season_totals(self):
        np.testing.assert_array_equal(self.raw[:, 0].sum(-1), self.raw[:, 1].sum(-1))
        annual = self.raw[:, 0].sum(dtype=np.uint64) / self.divisor
        self.assertAlmostEqual(self.meta["flashes"], annual)
        self.assertAlmostEqual(annual, self.source["year_flashes"].sum() / len(C.YEARS))
        for k, season in enumerate(C.SEASONS):
            self.assertAlmostEqual(self.meta["flashes_by_season"][season], self.raw[k, 0].sum(dtype=np.uint64) / self.divisor)

    def test_known_peak_and_sparse_cell_survive_export(self):
        annual = self.raw[:, 1].astype(np.uint32).sum(0) / self.divisor
        source = self.source["local"].sum(0)
        # These source cells expose both the old midnight peak shift and its 28% sparse-cell loss.
        for lat, lon in [(-25.5, -59.5), (-38.5, -24.5)]:
            i, j = int((lat - C.LAT0) / C.CELL_DEG), int((lon - C.LON0) / C.CELL_DEG)
            np.testing.assert_allclose(annual[i, j], source[i, j], rtol=0, atol=1e-10)
        self.assertEqual(int(annual[29, 75].argmax()), 23)

    def test_parts_and_gzip_match_whole_binary(self):
        self.assertEqual(gzip.decompress((ROOT / self.meta["counts_gzip"]).read_bytes()), self.raw_bytes)
        for k, season in enumerate(C.SEASONS):
            for ci, clock in enumerate(self.meta["clocks"]):
                part = self.meta["counts_parts"][season][clock]
                raw = (ROOT / part["file"]).read_bytes()
                self.assertEqual(part["bytes"], C.NLAT * C.NLON * C.HOURS * 2)
                self.assertEqual(len(raw), part["bytes"])
                self.assertEqual(raw, self.raw[k, ci].tobytes())
                self.assertEqual(gzip.decompress((ROOT / part["gzip"]).read_bytes()), raw)

    def test_density_domains_include_both_clocks(self):
        self.assertEqual(self.meta["km2_per_deg2_equator"], C.KM2_PER_DEG2_EQUATOR)
        lat = C.LAT0 + (np.arange(C.NLAT) + 0.5) * C.CELL_DEG
        area = C.KM2_PER_DEG2_EQUATOR * C.CELL_DEG ** 2 * np.cos(np.deg2rad(lat))
        density = self.means * (1e4 / area)[None, None, :, None, None]
        self.assertAlmostEqual(self.meta["density_domains"]["season"], float(density.max()))
        self.assertAlmostEqual(self.meta["density_domains"]["YEAR"], float(density.sum(0).max()))


class ResumeTests(unittest.TestCase):
    def namespace(self, directory):
        directory = Path(directory)
        settings = SimpleNamespace(DATA=directory, DAY_START=1, DAY_END=1, YEAR=2024, NLAT=1, NLON=1,
                                   HOURS=24, FETCH_WORKERS=1, GRID_NPZ=directory / "grid.npz", PROGRESS=directory / "progress.json")
        grid = np.zeros((1, 1, 24), np.int32)
        grid[0, 0, 0] = 1
        return {"C": settings, "np": np, "json": json, "os": os, "tempfile": tempfile, "Path": Path,
                "sys": SimpleNamespace(argv=["fixture", "1"]), "time": time, "datetime": datetime,
                "timedelta": timedelta, "E_EDGES": np.array([0, 1]), "A_EDGES": np.array([0, 1]),
                "bin_day": Mock(return_value=(grid, grid.copy(), 1, np.zeros(1, int), np.zeros(1, int)))}

    def main_function(self, namespace):
        names = {n.name for n in ast.parse((ROOT / "scripts" / "fetch_glm.py").read_text()).body if isinstance(n, ast.FunctionDef)}
        for name in ("save_grid", "restore_completed_days", "progress_report"):
            if name in names:
                fetch_function(name, namespace)
        return fetch_function("main", namespace)

    def test_crash_after_grid_commit_does_not_repeat_day(self):
        with tempfile.TemporaryDirectory(prefix="dsc106-resume-test-") as directory:
            ns = self.namespace(directory)
            path = ns["C"].PROGRESS

            class FailingReport:
                exists = path.exists
                read_text = path.read_text

                def write_text(self, text):
                    raise OSError("injected crash after grid commit")

            ns["C"].PROGRESS = FailingReport()
            main = self.main_function(ns)
            with self.assertRaisesRegex(OSError, "injected crash"):
                main()
            ns["C"].PROGRESS = path
            with redirect_stdout(StringIO()):
                main()
            saved = np.load(ns["C"].GRID_NPZ)
            self.assertEqual(int(saved["utc"].sum()), 1)
            self.assertEqual(int(saved["daily"].sum()), 1)
            self.assertEqual(ns["bin_day"].call_count, 1)
            self.assertEqual(json.loads(path.read_text())["1"]["files"], 1)

    def legacy_snapshot(self, ns):
        with np.load(ns["C"].GRID_NPZ) as saved:
            legacy = dict(saved)
        legacy.pop("completed_days")
        np.savez_compressed(ns["C"].GRID_NPZ, **legacy)

    def test_legacy_grid_without_report_is_not_recounted(self):
        with tempfile.TemporaryDirectory(prefix="dsc106-legacy-test-") as directory:
            ns = self.namespace(directory)
            main = self.main_function(ns)
            with redirect_stdout(StringIO()):
                main()
                self.legacy_snapshot(ns)
                ns["C"].PROGRESS.unlink()
                main()
            self.assertEqual(ns["bin_day"].call_count, 1)
            with np.load(ns["C"].GRID_NPZ) as saved:
                self.assertEqual(int(saved["utc"].sum()), 1)
                self.assertTrue(bool(saved["completed_days"][0]))

    def test_zero_file_day_marker_survives_missing_report(self):
        with tempfile.TemporaryDirectory(prefix="dsc106-empty-day-test-") as directory:
            ns = self.namespace(directory)
            empty = np.zeros((1, 1, 24), np.int32)
            ns["bin_day"].return_value = (empty, empty.copy(), 0, np.zeros(1, int), np.zeros(1, int))
            main = self.main_function(ns)
            with redirect_stdout(StringIO()):
                main()
                ns["C"].PROGRESS.unlink()
                main()
            self.assertEqual(ns["bin_day"].call_count, 1)
            self.assertEqual(json.loads(ns["C"].PROGRESS.read_text())["1"]["files"], 0)

    def test_corrupt_report_is_rebuilt_without_recounting(self):
        with tempfile.TemporaryDirectory(prefix="dsc106-report-test-") as directory:
            ns = self.namespace(directory)
            main = self.main_function(ns)
            with redirect_stdout(StringIO()):
                main()
                ns["C"].PROGRESS.write_text('{"1":')
                main()
            self.assertEqual(ns["bin_day"].call_count, 1)
            self.assertEqual(json.loads(ns["C"].PROGRESS.read_text())["1"]["flashes"], 1)

    def test_inconsistent_legacy_report_fails_closed(self):
        with tempfile.TemporaryDirectory(prefix="dsc106-legacy-conflict-test-") as directory:
            ns = self.namespace(directory)
            main = self.main_function(ns)
            with redirect_stdout(StringIO()):
                main()
            self.legacy_snapshot(ns)
            ns["C"].PROGRESS.write_text(json.dumps({"1": {"files": 1, "flashes": 2}}))
            with self.assertRaisesRegex(RuntimeError, "legacy progress.*disagrees"):
                main()
            self.assertEqual(ns["bin_day"].call_count, 1)

    def test_report_without_source_grid_fails_closed(self):
        with tempfile.TemporaryDirectory(prefix="dsc106-missing-grid-test-") as directory:
            ns = self.namespace(directory)
            ns["C"].PROGRESS.write_text(json.dumps({"1": {"files": 1, "flashes": 1}}))
            with self.assertRaisesRegex(RuntimeError, "without its source grid"):
                self.main_function(ns)()
            ns["bin_day"].assert_not_called()

    def test_failed_atomic_replace_preserves_previous_snapshot(self):
        with tempfile.TemporaryDirectory(prefix="dsc106-atomic-grid-test-") as directory:
            ns = self.namespace(directory)
            with redirect_stdout(StringIO()):
                self.main_function(ns)()
            before = ns["C"].GRID_NPZ.read_bytes()
            with np.load(ns["C"].GRID_NPZ) as saved:
                candidate = dict(saved)
            candidate["utc"] *= 2
            ns["os"] = SimpleNamespace(fsync=os.fsync, path=os.path, unlink=os.unlink,
                                       replace=Mock(side_effect=OSError("injected replace failure")))
            with self.assertRaisesRegex(OSError, "injected replace failure"):
                ns["save_grid"](candidate)
            self.assertEqual(ns["C"].GRID_NPZ.read_bytes(), before)
            self.assertEqual(list(Path(directory).glob("*.tmp")), [])


class DownloadCoverageTests(unittest.TestCase):
    def namespace(self, failed=False):
        settings = SimpleNamespace(NLAT=1, NLON=1, HOURS=24, LAT0=0, LON0=0, CELL_DEG=1, FETCH_WORKERS=1)
        empty = np.array([], dtype=float)
        return {
            "np": np, "C": settings, "ThreadPoolExecutor": ThreadPoolExecutor,
            "E_EDGES": np.array([-1, 1]), "A_EDGES": np.array([-1, 1]),
            "list_hour": lambda doy, hour: ["one", "two"] if hour == 0 else [],
            "download": lambda key: (key, None if failed and key == "two" else b"valid"),
            "parse": lambda key, body: (empty, empty, 0, empty, empty),
        }

    def test_failed_download_aborts_day(self):
        fn = fetch_function("bin_day", self.namespace(failed=True))
        with self.assertRaisesRegex(RuntimeError, "day 1.*1 GLM downloads failed"):
            fn(1, workers=1)

    def test_successful_zero_flash_files_count_towards_coverage(self):
        fn = fetch_function("bin_day", self.namespace())
        utc, local, files, _, _ = fn(1, workers=1)
        self.assertEqual(files, 2)
        self.assertEqual(int(utc.sum()), 0)
        np.testing.assert_array_equal(utc, local)

    def test_local_hour_uses_fractional_utc_and_flash_longitude(self):
        ns = self.namespace()
        ns["C"].LON0 = -76
        ns["parse"] = lambda key, body: (np.array([0.5]), np.array([-75.5]), 5.99, np.array([1.0]), np.array([1.0]))
        utc, local, files, _, _ = fetch_function("bin_day", ns)(1, workers=1)
        self.assertEqual(files, 2)
        self.assertEqual(int(utc[0, 0, 5]), 2)
        self.assertEqual(int(local[0, 0, 0]), 2)
        np.testing.assert_array_equal(utc.sum(-1), local.sum(-1))

    def test_parse_excludes_degraded_quality_flags(self):
        class Dataset(dict):
            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

        dataset = Dataset({
            "flash_quality_flag": np.array([0, 1, 0]), "flash_lat": np.array([0.5, 0.6, 0.7]),
            "flash_lon": np.array([-75.5, -76.5, -77.5]), "flash_energy": np.array([1.0, 2.0, 3.0]),
            "flash_area": np.array([4.0, 5.0, 6.0]),
        })
        ns = {"np": np, "datetime": datetime, "netCDF4": SimpleNamespace(Dataset=Mock(return_value=dataset))}
        lat, lon, hour, energy, area = fetch_function("parse", ns)("fixture_s20240010059500", b"valid")
        np.testing.assert_array_equal(lat, [0.5, 0.7])
        np.testing.assert_array_equal(lon, [-75.5, -77.5])
        np.testing.assert_array_equal(energy, [1.0, 3.0])
        np.testing.assert_array_equal(area, [4.0, 6.0])
        self.assertAlmostEqual(hour, 59 / 60 + 50 / 3600)

    def test_streaming_body_is_closed_on_success_and_failure(self):
        for fail in (False, True):
            body = Mock()
            body.read.side_effect = OSError("read failed") if fail else None
            body.read.return_value = b"valid"
            client = Mock()
            client.get_object.return_value = {"Body": body}
            ns = {"s3": client, "C": C, "time": SimpleNamespace(sleep=lambda seconds: None), "sys": sys}
            fn = fetch_function("download", ns)
            with redirect_stderr(StringIO()):
                key, data = fn("fixture-key")
            self.assertEqual(key, "fixture-key")
            self.assertEqual(data, None if fail else b"valid")
            self.assertEqual(body.close.call_count, C.DOWNLOAD_ATTEMPTS if fail else 1)


if __name__ == "__main__":
    unittest.main()
