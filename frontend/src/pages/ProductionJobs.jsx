import React, { useState, useEffect, useCallback } from "react";
import {
  Hammer,
  PlusCircle,
  ArrowRightCircle,
  ArrowDownLeft,
  Settings,
  Weight,
  AlertTriangle,
  Hash,
  Calculator,
  PlayCircle,
} from "lucide-react";
import {
  getActiveJobs,
  createJob,
  getNextJobId,
  completeStep,
  startJobStep,
} from "../api/jobService"; // Imported startJobStep
import Modal from "../components/Modal";
import Toast from "../components/Toast";

const sizeOptions = {
  Gold: [
    "0.05",
    "0.1 gm",
    "0.200",
    "0.5 gm",
    "1 gm",
    "2 gm",
    "5 gm",
    "10 gm",
    "20 gm",
    "25 gm",
    "50 gm",
  ],
  Silver: [
    "1g -Bar",
    "2g -Bar",
    "5g C|B",
    "10g -C|B",
    "10g COLOUR",
    "20g COLOUR",
    "50g COLOUR",
    "20g -C|B",
    "25g-C|B",
    "50g -C|B",
    "100g -C|B",
    "200g -Bar",
  ],
};

const ProductionJobs = () => {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [isShaking, setIsShaking] = useState(false);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isGeneratingId, setIsGeneratingId] = useState(false);
  const [createForm, setCreateForm] = useState({
    job_number: "",
    metal_type: "Gold",
    target_product: sizeOptions["Gold"][0],
    issue_weight: "",
  });

  const [isStepModalOpen, setIsStepModalOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [stepForm, setStepForm] = useState({
    issue_weight: "",
    return_weight: "",
    scrap_weight: "",
    return_pieces: "",
  });

  const showToast = (message, type) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const triggerError = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 500);
  };

  const fetchJobs = useCallback(async () => {
    try {
      const result = await getActiveJobs();
      if (result.success) setJobs(result.data);
    } catch (error) {
      showToast("Failed to load active jobs", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const openCreateModal = async () => {
    setIsGeneratingId(true);
    try {
      const result = await getNextJobId();
      if (result.success) {
        setCreateForm((prev) => ({
          ...prev,
          job_number: result.data.next_job_number,
          metal_type: "Gold",
          target_product: sizeOptions["Gold"][0],
          issue_weight: "",
        }));
        setIsCreateModalOpen(true);
      }
    } catch (error) {
      showToast("Failed to generate Job Number", "error");
    } finally {
      setIsGeneratingId(false);
    }
  };

  const handleMetalChange = (e) => {
    const newMetal = e.target.value;
    setCreateForm({
      ...createForm,
      metal_type: newMetal,
      target_product: sizeOptions[newMetal][0],
    });
  };

  const handleCreateJob = async (e) => {
    e.preventDefault();
    const weight = parseFloat(createForm.issue_weight);
    if (
      !createForm.job_number ||
      !createForm.target_product ||
      !weight ||
      weight <= 0
    ) {
      triggerError();
      showToast("Please enter a valid issue weight", "error");
      return;
    }

    try {
      await createJob(
        createForm.job_number,
        createForm.metal_type,
        createForm.target_product,
        weight,
      );
      showToast("Production Job Created & Queued!", "success");
      setIsCreateModalOpen(false);
      fetchJobs();
    } catch (error) {
      triggerError();
      showToast(error.message || "Failed to create job", "error");
    }
  };

  // --- NEW: START STEP LOGIC ---
  const handleStartStep = async (jobId, stepName) => {
    try {
      await startJobStep(jobId);
      showToast(`${stepName} Started!`, "success");
      fetchJobs(); // Refresh to show IN_PROGRESS
    } catch (error) {
      showToast("Failed to start step", "error");
    }
  };

  const openStepModal = (job) => {
    setSelectedJob(job);
    setStepForm({
      issue_weight: job.current_weight || "",
      return_weight: "",
      scrap_weight: "",
      return_pieces: "",
    });
    setIsStepModalOpen(true);
  };

  const handleCompleteStep = async (e) => {
    e.preventDefault();
    const { issue_weight, return_weight, scrap_weight, return_pieces } =
      stepForm;
    const issW = parseFloat(issue_weight) || 0;
    const retW = parseFloat(return_weight) || 0;
    const scrW = parseFloat(scrap_weight) || 0;

    if (issW <= 0 || retW <= 0) {
      triggerError();
      showToast("Issue and Return weights must be > 0", "error");
      return;
    }

    if (liveLoss < 0) {
      triggerError();
      showToast("Error: Return + Scrap exceeds Issue Weight!", "error");
      return;
    }

    try {
      await completeStep(
        selectedJob.id,
        selectedJob.current_step,
        issW,
        retW,
        scrW,
        return_pieces,
      );
      showToast(`Step Completed! Waiting for next approval.`, "success");
      setIsStepModalOpen(false);
      fetchJobs();
    } catch (error) {
      triggerError();
      showToast(error.message || "Failed to complete step", "error");
    }
  };

  // --- MATH CALCULATION ---
  const issVal = parseFloat(stepForm.issue_weight) || 0;
  const retVal = parseFloat(stepForm.return_weight) || 0;
  const scrVal = parseFloat(stepForm.scrap_weight) || 0;
  const liveLoss = parseFloat((issVal - retVal - scrVal).toFixed(3));
  const isLossNegative = liveLoss < 0;

  const requiresPieces =
    selectedJob &&
    (selectedJob.current_step === "TPP" ||
      selectedJob.current_step === "Packing");

  if (loading)
    return (
      <div className="p-8 text-center animate-pulse">
        Loading Production Floor...
      </div>
    );

  return (
    <div className="p-6 relative">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* HEADER */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 tracking-tight">
            Production Floor
          </h1>
          <p className="text-gray-500 mt-1">
            Manage manufacturing jobs & steps
          </p>
        </div>
        <button
          onClick={openCreateModal}
          disabled={isGeneratingId}
          className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700 shadow-lg active:scale-95 transition-all disabled:opacity-50"
        >
          <PlusCircle size={20} />
          <span className="font-semibold">
            {isGeneratingId ? "Generating..." : "Start New Job"}
          </span>
        </button>
      </div>

      {/* ACTIVE JOBS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {jobs.length === 0 ? (
          <div className="col-span-full bg-white p-10 rounded-2xl border border-dashed border-gray-300 text-center text-gray-500">
            <Settings size={48} className="mx-auto mb-3 opacity-20" />
            <p>No active production jobs.</p>
          </div>
        ) : (
          jobs.map((job) => {
            const isPending = job.status === "PENDING";

            return (
              <div
                key={job.id}
                className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow relative overflow-hidden flex flex-col justify-between"
              >
                <div>
                  <div
                    className={`absolute top-0 left-0 w-full h-1 ${job.metal_type === "Gold" ? "bg-yellow-400" : "bg-gray-400"}`}
                  ></div>
                  <div className="flex justify-between items-start mb-4 mt-2">
                    <div>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                        {job.job_number}
                      </p>
                      <h3 className="text-xl font-bold text-gray-800">
                        {job.target_product}
                      </h3>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold border ${isPending ? "bg-orange-50 text-orange-700 border-orange-200" : "bg-green-50 text-green-700 border-green-200"} flex items-center gap-1`}
                    >
                      {isPending ? "WAITING" : "RUNNING"}
                    </span>
                  </div>

                  <div
                    className={`p-4 rounded-xl mb-6 border ${isPending ? "bg-orange-50 border-orange-100" : "bg-blue-50 border-blue-100"}`}
                  >
                    <div className="flex justify-between items-center mb-3 pb-3 border-b border-white/40">
                      <span className="text-sm font-bold opacity-70">
                        Available Weight:
                      </span>
                      <span className="text-lg font-extrabold">
                        {job.current_weight
                          ? job.current_weight.toFixed(3)
                          : "0.000"}{" "}
                        <span className="text-sm font-medium opacity-70">
                          g
                        </span>
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-bold opacity-70">
                        Current Step:
                      </span>
                      <span className="px-3 py-1 bg-white rounded-lg font-bold text-sm tracking-wide shadow-sm">
                        {job.current_step}
                      </span>
                    </div>
                  </div>
                </div>

                {/* DYNAMIC BUTTON BASED ON STATUS */}
                {isPending ? (
                  <button
                    onClick={() => handleStartStep(job.id, job.current_step)}
                    className="w-full bg-orange-500 text-white font-bold py-3 rounded-xl hover:bg-orange-600 shadow-md active:scale-95 transition-all flex justify-center items-center gap-2"
                  >
                    <PlayCircle size={18} /> Approve & Start {job.current_step}
                  </button>
                ) : (
                  <button
                    onClick={() => openStepModal(job)}
                    className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 shadow-md active:scale-95 transition-all flex justify-center items-center gap-2"
                  >
                    Complete {job.current_step} <ArrowRightCircle size={18} />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* MODALS RETAINED EXACTLY AS BEFORE... */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create Production Job"
      >
        <form
          onSubmit={handleCreateJob}
          className={`space-y-5 ${isShaking && !isStepModalOpen ? "animate-shake" : ""}`}
        >
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 flex justify-between items-center">
            <span className="text-gray-500 font-bold text-sm">
              Serial Job ID:
            </span>
            <span className="font-mono font-bold text-blue-700">
              {createForm.job_number}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Metal
              </label>
              <div className="relative">
                <select
                  className="w-full bg-gray-50 border border-gray-200 py-3 px-4 rounded-lg outline-none cursor-pointer font-semibold"
                  value={createForm.metal_type}
                  onChange={handleMetalChange}
                >
                  <option value="Gold">Gold</option>
                  <option value="Silver">Silver</option>
                </select>
                <ArrowDownLeft
                  className="absolute right-3 top-3.5 text-gray-400 pointer-events-none"
                  size={16}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Target Product
              </label>
              <div className="relative">
                <select
                  className="w-full bg-gray-50 border border-gray-200 py-3 px-4 rounded-lg outline-none cursor-pointer font-semibold"
                  value={createForm.target_product}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      target_product: e.target.value,
                    })
                  }
                >
                  {sizeOptions[createForm.metal_type].map((product) => (
                    <option key={product} value={product}>
                      {product}
                    </option>
                  ))}
                </select>
                <ArrowDownLeft
                  className="absolute right-3 top-3.5 text-gray-400 pointer-events-none"
                  size={16}
                />
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">
              Issue Weight (Deducted from Pure Dhal)
            </label>
            <input
              type="number"
              step="0.001"
              required
              className="w-full bg-gray-50 border border-gray-200 py-3 px-4 rounded-lg outline-none focus:bg-white focus:border-blue-500 transition-colors text-lg font-bold"
              value={createForm.issue_weight}
              onChange={(e) =>
                setCreateForm({ ...createForm, issue_weight: e.target.value })
              }
              placeholder="0.000"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl hover:bg-blue-700 shadow-md active:scale-95 transition-all flex justify-center gap-2"
          >
            <Hammer size={20} /> Create Job & Queue for Rolling
          </button>
        </form>
      </Modal>

      <Modal
        isOpen={isStepModalOpen}
        onClose={() => setIsStepModalOpen(false)}
        title={`Complete Step: ${selectedJob?.current_step}`}
      >
        {selectedJob && (
          <form
            onSubmit={handleCompleteStep}
            className={`space-y-4 ${isShaking && isStepModalOpen ? "animate-shake" : ""}`}
          >
            <div className="flex justify-between items-center bg-blue-50 text-blue-800 px-4 py-2 rounded-lg border border-blue-100 mb-4">
              <span className="font-bold tracking-widest">
                {selectedJob.job_number}
              </span>
              <span className="font-bold">{selectedJob.target_product}</span>
            </div>

            <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200">
              <label className="block text-xs font-bold text-yellow-800 mb-1 uppercase tracking-wide">
                1. Issue Weight (Received for this step)
              </label>
              <input
                type="number"
                step="0.001"
                required
                className="w-full bg-white border border-yellow-300 py-3 px-4 rounded-lg outline-none focus:border-yellow-600 transition-colors font-bold text-lg text-yellow-900"
                value={stepForm.issue_weight}
                onChange={(e) =>
                  setStepForm({ ...stepForm, issue_weight: e.target.value })
                }
                placeholder="Weigh metal and enter here..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4 mt-2">
              <div>
                <label className="block text-xs font-bold text-green-700 mb-1 uppercase tracking-wide flex items-center gap-1">
                  <Weight size={14} /> 2. Good Output
                </label>
                <input
                  type="number"
                  step="0.001"
                  required
                  className="w-full bg-green-50 border border-green-200 py-3 px-4 rounded-lg outline-none focus:bg-white focus:border-green-500 transition-colors font-bold text-lg text-green-900"
                  value={stepForm.return_weight}
                  onChange={(e) =>
                    setStepForm({ ...stepForm, return_weight: e.target.value })
                  }
                  placeholder="0.000"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wide">
                  3. Scrap/Dust
                </label>
                <input
                  type="number"
                  step="0.001"
                  className="w-full bg-gray-50 border border-gray-200 py-3 px-4 rounded-lg outline-none focus:bg-white focus:border-gray-500 transition-colors font-bold text-lg text-gray-900"
                  value={stepForm.scrap_weight}
                  onChange={(e) =>
                    setStepForm({ ...stepForm, scrap_weight: e.target.value })
                  }
                  placeholder="0.000"
                />
              </div>
            </div>

            {requiresPieces && (
              <div className="mt-2">
                <label className="block text-xs font-bold text-purple-700 mb-1 uppercase tracking-wide flex items-center gap-1">
                  <Hash size={14} /> Final Quantity
                </label>
                <input
                  type="number"
                  step="1"
                  required
                  className="w-full bg-purple-50 border border-purple-200 py-3 px-4 rounded-lg outline-none focus:bg-white focus:border-purple-500 transition-colors font-bold text-lg text-purple-900"
                  value={stepForm.return_pieces}
                  onChange={(e) =>
                    setStepForm({ ...stepForm, return_pieces: e.target.value })
                  }
                  placeholder="Number of pieces produced"
                />
              </div>
            )}

            <div className="bg-gray-800 text-gray-200 p-4 rounded-xl mt-4 font-mono shadow-inner">
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm">Issue Weight:</span>
                <span>{issVal.toFixed(3)}</span>
              </div>
              <div className="flex justify-between items-center mb-1 text-green-400">
                <span className="text-sm">- Good Output:</span>
                <span>{retVal.toFixed(3)}</span>
              </div>
              <div className="flex justify-between items-center mb-3 text-yellow-400">
                <span className="text-sm">- Scrap/Dust:</span>
                <span>{scrVal.toFixed(3)}</span>
              </div>
              <div className="border-t border-gray-600 pt-3 flex justify-between items-center">
                <span className="font-bold flex items-center gap-2">
                  <Calculator size={16} /> Calculated Loss:
                </span>
                <span
                  className={`text-xl font-bold ${isLossNegative ? "text-red-500" : "text-white"}`}
                >
                  {liveLoss.toFixed(3)}
                </span>
              </div>
              {isLossNegative && (
                <div className="text-red-400 text-xs mt-2 flex items-center gap-1">
                  <AlertTriangle size={14} /> Output + Scrap cannot exceed Issue
                  Weight!
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={
                isLossNegative ||
                !stepForm.issue_weight ||
                !stepForm.return_weight
              }
              className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl hover:bg-blue-700 shadow-md active:scale-95 transition-all flex justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              Confirm Step & Send to Next Stage
            </button>
          </form>
        )}
      </Modal>
    </div>
  );
};

export default ProductionJobs;
