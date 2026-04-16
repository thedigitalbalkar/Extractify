import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import api from "./services/api";

const acceptedFiles = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
};

const POLL_INTERVAL_MS = 4000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const createInitialJobState = () => ({
  selectedFile: null,
  isProcessing: false,
  progress: 0,
  result: null,
  error: "",
});

const escapeCsvValue = (value) => {
  const stringValue = value == null ? "" : String(value);
  return `"${stringValue.replace(/"/g, '""')}"`;
};

const normalizeCompareKey = (record) => {
  if (!record || record.deleted) return "";
  return String(record.name || "")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\b[0O]\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const getLocationLabel = (record, index) => {
  const parts = [];
  if (record?.pageNumber) parts.push(`Page: ${record.pageNumber}`);
  if (record?.recordNumber) parts.push(`Serial No.: ${record.recordNumber}`);
  else parts.push(`Series: ${record?.series || index + 1}`);
  return parts.join(", ");
};

const getRecordSortValue = (record) => [
  Number(record?.series || Number.MAX_SAFE_INTEGER),
  Number(record?.pageNumber || Number.MAX_SAFE_INTEGER),
  Number(record?.recordNumber || Number.MAX_SAFE_INTEGER),
  Number(record?.originalIndex || Number.MAX_SAFE_INTEGER),
];

const compareRecordOrder = (left, right) => {
  const leftValues = getRecordSortValue(left);
  const rightValues = getRecordSortValue(right);

  for (let index = 0; index < leftValues.length; index += 1) {
    if (leftValues[index] !== rightValues[index]) {
      return leftValues[index] - rightValues[index];
    }
  }

  return String(left?.name || "").localeCompare(String(right?.name || ""));
};

const buildComparison = (leftRecords, rightRecords) => {
  const leftMap = new Map();
  const rightMap = new Map();

  leftRecords.forEach((record, index) => {
    const key = normalizeCompareKey(record);
    if (!key) return;
    const bucket = leftMap.get(key) || [];
    bucket.push({ ...record, originalIndex: index + 1 });
    leftMap.set(key, bucket);
  });

  rightRecords.forEach((record, index) => {
    const key = normalizeCompareKey(record);
    if (!key) return;
    const bucket = rightMap.get(key) || [];
    bucket.push({ ...record, originalIndex: index + 1 });
    rightMap.set(key, bucket);
  });

  const matched = [];
  const onlyInLeft = [];
  const onlyInRight = [];
  const allKeys = new Set([...leftMap.keys(), ...rightMap.keys()]);

  for (const key of allKeys) {
    const leftBucket = [...(leftMap.get(key) || [])].sort(compareRecordOrder);
    const rightBucket = [...(rightMap.get(key) || [])].sort(compareRecordOrder);
    const pairCount = Math.min(leftBucket.length, rightBucket.length);

    for (let i = 0; i < pairCount; i += 1) {
      matched.push({ key, left: leftBucket[i], right: rightBucket[i] });
    }

    if (leftBucket.length > pairCount) {
      onlyInLeft.push(...leftBucket.slice(pairCount));
    }

    if (rightBucket.length > pairCount) {
      onlyInRight.push(...rightBucket.slice(pairCount));
    }
  }

  matched.sort((a, b) => compareRecordOrder(a.left, b.left));
  onlyInLeft.sort(compareRecordOrder);
  onlyInRight.sort(compareRecordOrder);

  return { matched, onlyInLeft, onlyInRight };
};

function UploadZone({ title, job, onUpload, onClear }) {
  const onDrop = useCallback(
    (files) => {
      if (files[0]) {
        onUpload(files[0]);
      }
    },
    [onUpload]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: acceptedFiles,
    disabled: job.isProcessing,
  });

  const status = job.result?.status || (job.isProcessing ? "processing" : "idle");
  const fileLabel = job.selectedFile?.name || "No file selected yet";
  const processedPages = job.result?.processedPages || 0;
  const totalPages = job.result?.totalPages || 0;

  const statusMessage = () => {
    if (!job.isProcessing) return "Max size 15 MB.";
    if (job.progress < 100) return `Uploading... ${job.progress}%`;
    if (job.result?.status === "queued") return "Queued for extraction...";
    if (job.result?.status === "processing" && totalPages > 0) {
      return `Processing pages ${processedPages}/${totalPages}...`;
    }
    if (job.result?.status === "processing") return "Extracting in background...";
    return "Finalizing...";
  };

  return (
    <section className="clay-card upload-card compare-upload-card">
      <div {...getRootProps()} className={`dropzone ${isDragActive ? "dropzone-active" : ""}`}>
        <input {...getInputProps()} />
        {title ? <span className="compare-upload-label">{title}</span> : null}
        <h2>Drag and drop your file</h2>
        <p>PDF, JPG, and PNG are supported.</p>
        <button className="clay-button" type="button" disabled={job.isProcessing}>
          {job.isProcessing ? (job.progress >= 100 ? "Extracting..." : "Uploading...") : "Choose file"}
        </button>
      </div>

      <div className="upload-meta">
        <div className="upload-meta-head">
          <div>
            <span className="status-label">Current file</span>
            <strong className="file-name">{fileLabel}</strong>
          </div>
          <span className={`status-pill status-${status}`}>{status}</span>
        </div>

        <div className="progress-shell">
          <div className="progress-bar" style={{ width: `${job.progress}%` }} />
        </div>
        <div className="progress-meta">
          <span>{statusMessage()}</span>
          <strong>{job.progress}%</strong>
        </div>
        {job.error ? <p className="error-text">{job.error}</p> : null}

        <div className="action-row compare-upload-actions">
          <button type="button" className="ghost-button" onClick={onClear}>
            Clear
          </button>
        </div>
      </div>
    </section>
  );
}

function RecordCard({ record, index }) {

  if (record.deleted) {
    return (
      <article className="clay-card result-card result-card-deleted">
        <span className="result-label">{record.series || index + 1}</span>
        <strong className="result-value">Deleted</strong>

      </article>
    );
  }

  return (
    <article className="clay-card result-card">
      <span className="result-label">{record.series || index + 1}</span>
      <strong className="result-value">{record.name || "Not found"}</strong>
      <div className="result-details">
        {record.fatherName ? <p className="support-text">Father&apos;s Name: {record.fatherName}</p> : null}
        {record.husbandName ? <p className="support-text">Husband&apos;s Name: {record.husbandName}</p> : null}
        {record.motherName ? <p className="support-text">Mother&apos;s Name: {record.motherName}</p> : null}
        {record.otherName ? <p className="support-text">Others: {record.otherName}</p> : null}
      </div>
    </article>
  );
}

function App() {
  const [view, setView] = useState(() =>
    window.location.pathname.toLowerCase().startsWith("/compare") ? "compare" : "extract"
  );
  const [theme, setTheme] = useState("light");
  const [extractJob, setExtractJob] = useState(createInitialJobState);
  const [compareLeftJob, setCompareLeftJob] = useState(createInitialJobState);
  const [compareRightJob, setCompareRightJob] = useState(createInitialJobState);
  const activeResultIdsRef = useRef(new Set());

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    return () => document.documentElement.setAttribute("data-theme", "light");
  }, [theme]);

  useEffect(() => {
    const syncView = () => {
      setView(window.location.pathname.toLowerCase().startsWith("/compare") ? "compare" : "extract");
    };

    window.addEventListener("popstate", syncView);
    return () => window.removeEventListener("popstate", syncView);
  }, []);

  useEffect(() => {
    const cancelActiveExtraction = () => {
      const activeIds = Array.from(activeResultIdsRef.current);
      if (!activeIds.length) return;

      activeIds.forEach((resultId) => {
        const cancelUrl = `${api.defaults.baseURL}/results/${resultId}/cancel`;

        try {
          if (navigator.sendBeacon) {
            const blob = new Blob(["cancel"], { type: "text/plain;charset=UTF-8" });
            navigator.sendBeacon(cancelUrl, blob);
            return;
          }
        } catch {}

        try {
          fetch(cancelUrl, { method: "POST", keepalive: true });
        } catch {}
      });
    };

    window.addEventListener("pagehide", cancelActiveExtraction);
    window.addEventListener("beforeunload", cancelActiveExtraction);

    return () => {
      window.removeEventListener("pagehide", cancelActiveExtraction);
      window.removeEventListener("beforeunload", cancelActiveExtraction);
    };
  }, []);

  const navigateTo = (nextView) => {
    const nextPath = nextView === "compare" ? "/compare" : "/";
    window.history.pushState({}, "", nextPath);
    setView(nextView);
  };

  const registerActiveId = (id) => {
    if (id) activeResultIdsRef.current.add(id);
  };

  const unregisterActiveId = (id) => {
    if (id) activeResultIdsRef.current.delete(id);
  };

  const cancelResult = async (id) => {
    if (!id) return;
    try {
      await api.post(`/results/${id}/cancel`);
    } catch {}
    unregisterActiveId(id);
  };

  const pollResult = async (resultId, setJob) => {
    while (true) {
      const response = await api.get(`/results/${resultId}`);
      setJob((current) => ({ ...current, result: response.data }));

      if (response.data.status === "completed") return response.data;
      if (response.data.status === "failed") {
        throw new Error(
          response.data.errorMessage ||
            "We could not process that file. Please retry with another document."
        );
      }
      if (response.data.status === "cancelled") {
        throw new Error("Extraction cancelled.");
      }

      await sleep(POLL_INTERVAL_MS);
    }
  };

  const uploadAndPoll = async (file, setJob) => {
    setJob({
      selectedFile: file,
      isProcessing: true,
      progress: 0,
      result: null,
      error: "",
    });

    const formData = new FormData();
    formData.append("file", file);
    let resultId = null;

    try {
      const response = await api.post("/api/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 120000,
        onUploadProgress: (event) => {
          if (!event.total) return;
          setJob((current) => ({
            ...current,
            progress: Math.min(100, Math.round((event.loaded / event.total) * 100)),
          }));
        },
      });

      resultId = response.data.id;
      registerActiveId(resultId);

      setJob((current) => ({
        ...current,
        progress: 100,
        result: response.data,
      }));

      await pollResult(resultId, setJob);
    } catch (uploadError) {
      setJob((current) => ({
        ...current,
        result: null,
        error:
          uploadError?.response?.data?.message ||
          uploadError?.message ||
          "We could not process that file. Please retry with another document.",
      }));
    } finally {
      unregisterActiveId(resultId);
      setJob((current) => ({ ...current, isProcessing: false }));
    }
  };

  const resetJob = async (job, setJob) => {
    await cancelResult(job.result?.id);
    setJob(createInitialJobState());
  };

  const extractRecords = extractJob.result?.records || [];
  const extractConfidence = Math.round((extractJob.result?.confidenceScore || 0) * 100);
  const comparison = useMemo(() => {
    if (compareLeftJob.result?.status !== "completed" || compareRightJob.result?.status !== "completed") {
      return null;
    }

    return buildComparison(compareLeftJob.result.records || [], compareRightJob.result.records || []);
  }, [compareLeftJob.result, compareRightJob.result]);

  const downloadCsv = () => {
    if (!extractRecords.length) return;

    const rows = [
      ["Series", "Page", "Record", "Location", "Name", "Father's Name", "Husband's Name", "Mother's Name", "Others", "Deleted"],
      ...extractRecords.map((record, index) => [
        record.series || index + 1,
        record.pageNumber || "",
        record.recordNumber || "",
        getLocationLabel(record, index),
        record.deleted ? "Deleted" : record.name || "",
        record.fatherName || "",
        record.husbandName || "",
        record.motherName || "",
        record.otherName || "",
        record.deleted ? "Yes" : "No",
      ]),
    ];

    const csv = rows.map((row) => row.map((value) => escapeCsvValue(value)).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const baseName = (extractJob.result?.originalFileName || "extractify-result")
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-z0-9-_]+/gi, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "extractify-result";
    link.href = url;
    link.download = `${baseName}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const extractStatusMessage = () => {
    if (!extractJob.isProcessing) return "Max size 15 MB.";
    if (extractJob.progress < 100) return `Uploading... ${extractJob.progress}%`;
    if (extractJob.result?.status === "queued") return "Queued for extraction...";
    if (extractJob.result?.status === "processing" && extractJob.result?.totalPages) {
      return `Processing pages ${extractJob.result.processedPages}/${extractJob.result.totalPages}... Partial records will keep appearing.`;
    }
    if (extractJob.result?.status === "processing") return "Extracting in background... Partial records will keep appearing.";
    return "Finalizing...";
  };

  return (
    <main className="app-shell">
      <div className="topbar">
        <span className="hero-pill">Extractify</span>
        <div className="topbar-actions">
          <button
            type="button"
            className="theme-toggle"
            onClick={() => navigateTo(view === "compare" ? "extract" : "compare")}
          >
            {view === "compare" ? "Home" : "Compare"}
          </button>
          <button
            type="button"
            className="theme-toggle"
            onClick={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
          >
            {theme === "light" ? "Dark Mode" : "Light Mode"}
          </button>
        </div>
      </div>

      <div className="background-orb orb-one" />
      <div className="background-orb orb-two" />

      {view === "extract" ? (
        <>
          <section className="hero">
            <div className="hero-copy hero-copy-full">
              <h1>Extract ordered records from PDF and image files.</h1>
              <p>
                Upload a file and get clean Name, Father&apos;s Name, Husband&apos;s Name, Mother&apos;s Name, and Others records in order.
              </p>
            </div>
          </section>

          <UploadZone
            job={extractJob}
            onUpload={(file) => uploadAndPoll(file, setExtractJob)}
            onClear={() => resetJob(extractJob, setExtractJob)}
          />

          <section className="results-section">
            <div className="section-head results-head">
              <h3>Ordered Records</h3>
              <span className="confidence-chip">Confidence {extractJob.result ? `${extractConfidence}%` : "0%"}</span>
            </div>

            {extractRecords.length ? (
              <div className="result-grid">
                {extractRecords.map((record, index) => (
                  <RecordCard
                    key={`${record.series || index + 1}-${record.name || (record.deleted ? "deleted" : "record")}`}
                    record={record}
                    index={index}
                  />
                ))}
              </div>
            ) : (
              <article className="flat-card empty-state-card">
                <p className="support-text">
                  {extractJob.isProcessing
                    ? "Extraction is in progress. Records will appear here automatically as pages finish processing."
                    : "Upload a file to generate ordered records."}
                </p>
              </article>
            )}
          </section>

          <section className="details-grid">
            <article className="flat-card summary-card">
              <div className="section-head">
                <h3>Summary</h3>
              </div>

              <div className="summary-stats compact-grid">
                <div className="summary-stat">
                  <span className="summary-label">Status: <strong>{extractJob.result?.status || (extractJob.isProcessing ? "processing" : "idle")}</strong></span>
                </div>
                <div className="summary-stat">
                  <span className="summary-label">Records: <strong>{extractRecords.length}</strong></span>
                </div>
                <div className="summary-stat">
                  <span className="summary-label">Pages: <strong>{extractJob.result?.processedPages || 0}/{extractJob.result?.totalPages || 0}</strong></span>
                </div>
              </div>

              {extractJob.result?.warnings?.length ? (
                <ul className="warning-list">
                  {extractJob.result.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : extractJob.result?.status === "completed" ? (
                <p className="success-text">Extraction completed.</p>
              ) : extractJob.isProcessing ? (
                <p className="support-text">{extractStatusMessage()}</p>
              ) : (
                <p className="support-text">Upload a file to see the result summary.</p>
              )}

              <div className="action-row">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={downloadCsv}
                  disabled={!extractRecords.length || extractJob.result?.status !== "completed"}
                >
                  Download CSV
                </button>
                <button type="button" className="ghost-button" onClick={() => resetJob(extractJob, setExtractJob)}>
                  Retry
                </button>
              </div>
            </article>

            <article className="flat-card raw-card">
              <div className="section-head">
                <h3>Raw Text</h3>
              </div>
              <textarea className="raw-text-area" readOnly value={extractJob.result?.rawExtractedText || ""} />
            </article>
          </section>
        </>
      ) : (
        <>
          <section className="hero compare-hero">
            <div className="hero-copy hero-copy-full">
              <h1>Compare two extracted PDFs.</h1>
              <p>
                Upload two files, extract both record sets, and compare people with the same names across the two documents.
              </p>
            </div>
          </section>

          <section className="compare-grid">
            <UploadZone
              title="Left file"
              job={compareLeftJob}
              onUpload={(file) => uploadAndPoll(file, setCompareLeftJob)}
              onClear={() => resetJob(compareLeftJob, setCompareLeftJob)}
            />
            <UploadZone
              title="Right file"
              job={compareRightJob}
              onUpload={(file) => uploadAndPoll(file, setCompareRightJob)}
              onClear={() => resetJob(compareRightJob, setCompareRightJob)}
            />
          </section>

          <section className="details-grid compare-summary-grid">
            <article className="flat-card summary-card">
              <div className="section-head">
                <h3>Compare Summary</h3>
              </div>
              {comparison ? (
                <div className="summary-stats compare-stats-grid">
                  <div className="summary-stat">
                    <span className="summary-label">Matched Names: <strong>{comparison.matched.length}</strong></span>
                  </div>
                  <div className="summary-stat">
                    <span className="summary-label">Only In Left: <strong>{comparison.onlyInLeft.length}</strong></span>
                  </div>
                  <div className="summary-stat">
                    <span className="summary-label">Only In Right: <strong>{comparison.onlyInRight.length}</strong></span>
                  </div>
                  <div className="summary-stat">
                    <span className="summary-label">Left Records: <strong>{(compareLeftJob.result?.records || []).filter((record) => !record.deleted).length}</strong></span>
                  </div>
                  <div className="summary-stat">
                    <span className="summary-label">Right Records: <strong>{(compareRightJob.result?.records || []).filter((record) => !record.deleted).length}</strong></span>
                  </div>
                </div>
              ) : (
                <p className="support-text">Upload and complete extraction for both files to compare matching names.</p>
              )}
            </article>
          </section>

          {comparison ? (
            <section className="compare-results-grid">
              <article className="flat-card compare-list-card">
                <div className="section-head">
                  <h3>Matched Names</h3>
                </div>
                <div className="compare-list">
                  {comparison.matched.slice(0, 100).map((pair) => (
                    <div key={`${pair.key}-${pair.left.originalIndex}-${pair.right.originalIndex}`} className="compare-list-item">
                      <strong>{pair.left.name}</strong>
                      <span className="support-text">Left: {getLocationLabel(pair.left, pair.left.originalIndex - 1)}</span>
                      <span className="support-text">Right: Series {pair.right.series || pair.right.originalIndex}</span>
                    </div>
                  ))}
                </div>
              </article>

              <article className="flat-card compare-list-card">
                <div className="section-head">
                  <h3>Only In Left</h3>
                </div>
                <div className="compare-list">
                  {comparison.onlyInLeft.slice(0, 100).map((record) => (
                    <div key={`left-${record.originalIndex}-${record.name}`} className="compare-list-item">
                      <strong>{record.name}</strong>
                      <span className="support-text">{getLocationLabel(record, record.originalIndex - 1)}</span>
                    </div>
                  ))}
                </div>
              </article>

              <article className="flat-card compare-list-card">
                <div className="section-head">
                  <h3>Only In Right</h3>
                </div>
                <div className="compare-list">
                  {comparison.onlyInRight.slice(0, 100).map((record) => (
                    <div key={`right-${record.originalIndex}-${record.name}`} className="compare-list-item">
                      <strong>{record.name}</strong>
                      <span className="support-text">Series {record.series || record.originalIndex}</span>
                    </div>
                  ))}
                </div>
              </article>
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}

export default App;
