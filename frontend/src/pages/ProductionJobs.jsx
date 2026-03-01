import React, { useState, useEffect, useCallback } from "react";
import {
  Hammer,
  PlusCircle,
  PlayCircle,
  ArrowRightCircle,
  CheckCircle,
  Calculator,
  AlertTriangle,
  Hash,
  ArrowDownLeft,
  Weight,
  Search,
  Eye,
  Trash2,
  Edit,
  Undo2,
} from "lucide-react";
import {
  getCombinedProcesses,
  createProcess,
  startProcess,
  completeProcess,
  getNextJobId,
  editProcess,
  deleteProcess,
  reverseProcess,
  editCompletedProcess,
} from "../api/jobService";
import Modal from "../components/Modal";
import Toast from "../components/Toast";
import { useNavigate } from "react-router-dom";

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

const stages = ["Rolling", "Press", "TPP", "Packing"];

const ProductionJobs = () => {
  const [processes, setProcesses] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [isShaking, setIsShaking] = useState(false);
  const navigate = useNavigate();

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isStartModalOpen, setIsStartModalOpen] = useState(false);
  const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);
  const [isNextStep, setIsNextStep] = useState(false);

  const [selectedProcess, setSelectedProcess] = useState(null);

  const [createForm, setCreateForm] = useState({
    stage: "Rolling",
    job_number: "",
    original_next_job: "",
    metal_type: "Gold",
    category: sizeOptions["Gold"][0],
    issue_size: "",
    weight_unit: "g",
  });

  const [startForm, setStartForm] = useState({
    issued_weight: "",
    weight_unit: "g",
  });
  const [completeForm, setCompleteForm] = useState({
    return_weight: "",
    scrap_weight: "",
    return_pieces: "",
  });
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    issued_weight: "",
    weight_unit: "g",
  });
  const [isEditCompletedModalOpen, setIsEditCompletedModalOpen] = useState(false);
  const [editCompletedForm, setEditCompletedForm] = useState({
    return_weight: "",
    scrap_weight: "",
    return_pieces: "",
    weight_unit: "g",
  });
  const [isReverseModalOpen, setIsReverseModalOpen] = useState(false);
  const [reversingProcess, setReversingProcess] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const showToast = (message, type) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };
  const triggerError = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 500);
  };

  const fetchProcesses = useCallback(async () => {
    try {
      const result = await getCombinedProcesses();
      if (result.success) setProcesses(result.data);
    } catch (error) {
      showToast("Failed to load processes", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProcesses();
  }, [fetchProcesses]);

  const openCreateModal = async () => {
    try {
      const result = await getNextJobId();
      if (result.success) {
        setCreateForm((prev) => ({
          ...prev,
          job_number: result.data.next_job_number,
          original_next_job: result.data.next_job_number,
          stage: "Rolling",
          metal_type: "Gold",
          category: sizeOptions["Gold"][0],
          issue_size: "",
          job_name: "",
          weight_unit: "g",
        }));
        setIsNextStep(false);
        setIsCreateModalOpen(true);
      }
    } catch (error) {
      showToast("Failed to generate Job Number", "error");
    }
  };

  const openNextStepModal = (process) => {
    let nextStage = "Rolling";
    if (process.stage === "Rolling") nextStage = "Press";
    if (process.stage === "Press") nextStage = "TPP";
    if (process.stage === "TPP") nextStage = "Packing";
    if (process.stage === "Packing")
      return showToast("Packing is the final stage.", "error");

    setCreateForm({
      stage: nextStage,
      job_number: process.job_number,
      job_name: process.job_name || "",
      metal_type: process.metal_type,
      category: process.category || sizeOptions[process.metal_type][0],
      issue_size:
        process.metal_type === "Silver"
          ? (process.return_weight / 1000).toString()
          : process.return_weight.toString(),
      weight_unit: process.metal_type === "Silver" ? "kg" : "g",
    });
    setIsNextStep(true);
    setIsCreateModalOpen(true);
  };

  const openViewModal = (job_number) => {
    navigate(`/job-history/${job_number}`);
  };

  const handleCreateProcess = async (e) => {
    e.preventDefault();
    let weight = parseFloat(createForm.issue_size);
    if (createForm.weight_unit === "kg") weight *= 1000;

    if (!createForm.job_number || !weight || weight <= 0) {
      triggerError();
      return showToast("Invalid issue size", "error");
    }
    try {
      await createProcess(createForm.stage, {
        job_number: createForm.job_number,
        job_name: createForm.job_number, // Default to job_number internally to prevent NULL
        metal_type: createForm.metal_type,
        unit: "g",
        employee: "Worker",
        issue_size: weight,
        category: createForm.category,
      });
      showToast(`${createForm.stage} Process Created!`, "success");
      setIsCreateModalOpen(false);
      fetchProcesses();
    } catch (error) {
      triggerError();
      showToast(error.message || "Failed", "error");
    }
  };

  const openStartModal = (process) => {
    setSelectedProcess(process);
    setStartForm({
      issued_weight:
        process.metal_type === "Silver"
          ? process.issue_size / 1000
          : process.issue_size || "",
      weight_unit: process.metal_type === "Silver" ? "kg" : "g",
    });
    setIsStartModalOpen(true);
  };

  const handleStartProcess = async (e) => {
    e.preventDefault();
    let weight = parseFloat(startForm.issued_weight);
    if (startForm.weight_unit === "kg") weight *= 1000;

    if (!weight || weight <= 0) {
      triggerError();
      return showToast("Invalid weight", "error");
    }
    try {
      await startProcess(
        selectedProcess.stage,
        selectedProcess.id,
        startForm.issued_weight,
      );
      showToast("Started!", "success");
      setIsStartModalOpen(false);
      fetchProcesses();
    } catch (error) {
      triggerError();
      showToast(error.message, "error");
    }
  };

  const openEditModal = (process) => {
    setSelectedProcess(process);
    setEditForm({
      issued_weight:
        process.metal_type === "Silver"
          ? process.issued_weight / 1000
          : process.issued_weight || "",
      weight_unit: process.metal_type === "Silver" ? "kg" : "g",
    });
    setIsEditModalOpen(true);
  };

  const handleEditProcess = async (e) => {
    e.preventDefault();
    let weight = parseFloat(editForm.issued_weight);
    if (editForm.weight_unit === "kg") weight *= 1000;

    if (!weight || weight <= 0) {
      triggerError();
      return showToast("Invalid weight", "error");
    }

    try {
      await editProcess(selectedProcess.stage, selectedProcess.id, {
        issued_weight: weight,
      });
      showToast("Job Updated Successfully!", "success");
      setIsEditModalOpen(false);
      fetchProcesses();
    } catch (error) {
      triggerError();
      showToast(error.message || "Failed to edit job", "error");
    }
  };

  const handleDeleteProcess = async (process) => {
    if (
      !window.confirm(
        `Are you SURE you want to permanently delete the ${process.status} Job ${process.job_number} at the ${process.stage} stage? This will entirely reverse the stock math and return physical metals back to their raw states.`,
      )
    )
      return;

    try {
      await deleteProcess(process.stage, process.id);
      showToast("Job Deleted and Stock Reversed!", "success");
      fetchProcesses();
    } catch (error) {
      showToast(error.message || "Failed to delete job", "error");
    }
  };

  // --- REVERSE PROCESS ---
  const openReverseModal = (process) => {
    setReversingProcess(process);
    setIsReverseModalOpen(true);
  };

  const handleReverseProcess = async () => {
    if (!reversingProcess) return;
    setActionLoading(true);
    try {
      const result = await reverseProcess(reversingProcess.stage, reversingProcess.id);
      if (result.success) {
        showToast(result.message || "Process reversed!", "success");
        setIsReverseModalOpen(false);
        setReversingProcess(null);
        fetchProcesses();
      } else {
        showToast(result.message || "Reverse failed", "error");
      }
    } catch (error) {
      showToast(error.message || "Failed to reverse process", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // --- EDIT COMPLETED PROCESS ---
  const openEditCompletedModal = (process) => {
    setSelectedProcess(process);
    const unit = process.metal_type === "Silver" ? "kg" : "g";
    const divisor = unit === "kg" ? 1000 : 1;
    setEditCompletedForm({
      return_weight: (process.return_weight / divisor).toString(),
      scrap_weight: (process.scrap_weight / divisor).toString(),
      return_pieces: (process.return_pieces || 0).toString(),
      weight_unit: unit,
    });
    setIsEditCompletedModalOpen(true);
  };

  const handleEditCompletedProcess = async (e) => {
    e.preventDefault();
    let retW = parseFloat(editCompletedForm.return_weight) || 0;
    let scrW = parseFloat(editCompletedForm.scrap_weight) || 0;
    if (editCompletedForm.weight_unit === "kg") {
      retW *= 1000;
      scrW *= 1000;
    }
    if (retW < 0 || scrW < 0) {
      triggerError();
      return showToast("Weights cannot be negative", "error");
    }
    const issW = selectedProcess.issued_weight;
    const loss = parseFloat((issW - retW - scrW).toFixed(3));
    if (loss < 0) {
      triggerError();
      return showToast("Return + Scrap exceeds Issued Weight!", "error");
    }
    setActionLoading(true);
    try {
      const result = await editCompletedProcess(selectedProcess.stage, selectedProcess.id, {
        return_weight: retW,
        scrap_weight: scrW,
        return_pieces: parseInt(editCompletedForm.return_pieces) || 0,
      });
      if (result.success) {
        showToast("Completed process updated!", "success");
        setIsEditCompletedModalOpen(false);
        setSelectedProcess(null);
        fetchProcesses();
      } else {
        triggerError();
        showToast(result.message || "Update failed", "error");
      }
    } catch (error) {
      triggerError();
      showToast(error.message || "Failed to update", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const openCompleteModal = (process) => {
    setSelectedProcess(process);
    setCompleteForm({
      return_weight: "",
      scrap_weight: "",
      return_pieces: "",
      weight_unit: process.metal_type === "Silver" ? "kg" : "g",
    });
    setIsCompleteModalOpen(true);
  };

  const handleCompleteProcess = async (e) => {
    e.preventDefault();
    const issW = parseFloat(selectedProcess.issued_weight);
    let retW = parseFloat(completeForm.return_weight) || 0;
    let scrW = parseFloat(completeForm.scrap_weight) || 0;

    if (completeForm.weight_unit === "kg") {
      retW *= 1000;
      scrW *= 1000;
    }

    const liveLoss = issW - retW - scrW;

    if (retW <= 0) {
      triggerError();
      return showToast("Return must be > 0", "error");
    }
    if (liveLoss < 0) {
      triggerError();
      return showToast("Return + Scrap exceeds Issued", "error");
    }

    let pieces = parseInt(completeForm.return_pieces) || 0;
    if (
      selectedProcess.stage === "TPP" ||
      selectedProcess.stage === "Packing"
    ) {
      const catWeight = parseFloat(selectedProcess.category) || 0;
      if (catWeight > 0) {
        const maxPieces = Math.floor(issW / catWeight);
        if (pieces > maxPieces) {
          triggerError();
          return showToast(
            `Max possible pieces for this category is ${maxPieces}`,
            "error",
          );
        }
      }
    }

    try {
      await completeProcess(selectedProcess.stage, {
        process_id: selectedProcess.id,
        return_weight: retW,
        scrap_weight: scrW,
        return_pieces: parseInt(completeForm.return_pieces) || 0,
      });
      showToast("Completed!", "success");
      setIsCompleteModalOpen(false);
      fetchProcesses();
    } catch (error) {
      triggerError();
      showToast(error.message, "error");
    }
  };

  const getLatestProcesses = (procs) => {
    const stagePriority = { Rolling: 1, Press: 2, TPP: 3, Packing: 4 };
    const jobMap = {};

    procs.forEach((p) => {
      const key = p.job_number || `unknown-${p.id}`;

      if (!jobMap[key]) {
        jobMap[key] = p;
      } else {
        const existing = jobMap[key];
        if (stagePriority[p.stage] > stagePriority[existing.stage]) {
          jobMap[key] = p;
        } else if (stagePriority[p.stage] === stagePriority[existing.stage]) {
          if (new Date(p.date) > new Date(existing.date)) {
            jobMap[key] = p;
          }
        }
      }
    });

    return Object.values(jobMap).sort(
      (a, b) => new Date(b.date) - new Date(a.date),
    );
  };

  const latestProcesses = getLatestProcesses(processes);

  const filteredProcesses = latestProcesses.filter(
    (p) =>
      (p.job_number || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.job_name || "").toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const reqPieces =
    selectedProcess &&
    (selectedProcess.stage === "TPP" || selectedProcess.stage === "Packing");
  const issVal = selectedProcess
    ? parseFloat(selectedProcess.issued_weight) || 0
    : 0;
  let retVal = parseFloat(completeForm.return_weight) || 0;
  let scrVal = parseFloat(completeForm.scrap_weight) || 0;

  if (completeForm?.weight_unit === "kg") {
    retVal *= 1000;
    scrVal *= 1000;
  }
  const liveLoss = parseFloat((issVal - retVal - scrVal).toFixed(3));
  const isLossNegative = liveLoss < 0;

  const getAvailableJobNumbers = () => {
    let prevStage = "Rolling";
    if (createForm.stage === "TPP") prevStage = "Press";
    if (createForm.stage === "Packing") prevStage = "TPP";

    return [
      ...new Set(
        processes
          .filter((p) => p.stage === prevStage && p.status === "COMPLETED")
          .map((p) => p.job_number),
      ),
    ];
  };

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

      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 tracking-tight">
            Production Floor
          </h1>
          <p className="text-gray-500 mt-1">Unified Process Table & Tracking</p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700 shadow-lg active:scale-95 transition-all"
        >
          <PlusCircle size={20} />{" "}
          <span className="font-semibold">Create Process Job</span>
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-6">
        <div className="p-4 border-b border-gray-100 flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search by Job Number or Name..."
              className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-blue-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-sm uppercase tracking-wider">
                <th className="p-4 font-bold border-b border-gray-100">
                  Job No
                </th>
                <th className="p-4 font-bold border-b border-gray-100">
                  Stage
                </th>
                <th className="p-4 font-bold border-b border-gray-100">
                  Metal / Category
                </th>
                <th className="p-4 font-bold border-b border-gray-100">
                  Status
                </th>
                <th className="p-4 font-bold border-b border-gray-100">
                  Weights (Iss/Ret/Loss)
                </th>
                <th className="p-4 font-bold border-b border-gray-100 text-center">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredProcesses.map((p) => (
                <tr
                  key={`${p.stage}-${p.id}`}
                  className="hover:bg-gray-50 border-b border-gray-50 transition-colors"
                >
                  <td className="p-4">
                    <div className="font-bold text-gray-800">
                      {p.job_number}
                    </div>
                    <div className="text-xs text-gray-500">{p.job_name}</div>
                  </td>
                  <td className="p-4 font-bold text-blue-800">{p.stage}</td>
                  <td className="p-4 flex flex-col items-start gap-1">
                    <span
                      className={`px-2 py-1 rounded-md text-xs font-bold ${p.metal_type === "Gold" ? "bg-yellow-100 text-yellow-800" : "bg-gray-200 text-gray-700"}`}
                    >
                      {p.metal_type}
                    </span>
                    <span className="text-xs font-semibold text-gray-500">
                      {p.category}
                    </span>
                  </td>
                  <td className="p-4">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold border ${p.status === "PENDING" ? "bg-orange-50 text-orange-700 border-orange-200" : p.status === "RUNNING" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-green-50 text-green-700 border-green-200"}`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="p-4 text-sm font-mono text-gray-700">
                    <div>
                      <span className="text-gray-400">Iss:</span>{" "}
                      {p.issued_weight
                        ? p.issued_weight.toFixed(2)
                        : p.issue_size.toFixed(2)}
                    </div>
                    {p.status === "COMPLETED" && (
                      <>
                        <div className="text-green-600">
                          <span className="text-gray-400">Ret:</span>{" "}
                          {p.return_weight.toFixed(2)}
                        </div>
                        <div className="text-red-500">
                          <span className="text-gray-400">Los:</span>{" "}
                          {p.loss_weight.toFixed(2)}
                        </div>
                      </>
                    )}
                  </td>
                  <td className="p-4">
                    <div className="flex flex-col items-center gap-2">
                      {p.status === "COMPLETED" && (
                        <CheckCircle size={20} className="text-green-500" />
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        {p.status === "PENDING" && (
                          <>
                            <button
                              onClick={() => openStartModal(p)}
                              className="bg-orange-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-orange-600 active:scale-95 flex items-center justify-center gap-1 w-28"
                            >
                              <PlayCircle size={14} /> Start
                            </button>
                            <button
                              onClick={() => handleDeleteProcess(p)}
                              className="bg-red-50 text-red-600 border border-red-200 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-100 active:scale-95 flex items-center justify-center gap-1 w-28"
                            >
                              <Trash2 size={14} /> Delete
                            </button>
                          </>
                        )}
                        {p.status === "RUNNING" && (
                          <>
                            <button
                              onClick={() => openCompleteModal(p)}
                              className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-700 active:scale-95 flex items-center justify-center gap-1 w-28"
                            >
                              <ArrowRightCircle size={14} /> Complete
                            </button>
                            <button
                              onClick={() => openEditModal(p)}
                              className="bg-gray-100 text-gray-700 border border-gray-300 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-gray-200 active:scale-95 flex items-center justify-center gap-1 w-28"
                            >
                              <Edit size={14} /> Edit Weight
                            </button>
                            <button
                              onClick={() => handleDeleteProcess(p)}
                              className="bg-red-50 text-red-600 border border-red-200 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-100 active:scale-95 flex items-center justify-center gap-1 w-28"
                            >
                              <Trash2 size={14} /> Delete
                            </button>
                          </>
                        )}
                        {p.status === "COMPLETED" && (
                          <>
                            {p.stage !== "Packing" && (
                              <button
                                onClick={() => openNextStepModal(p)}
                                className="bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-200 active:scale-95 flex items-center justify-center gap-1 w-28"
                              >
                                <ArrowRightCircle size={14} /> Start Next
                              </button>
                            )}
                            <button
                              onClick={() => openReverseModal(p)}
                              className="bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-amber-100 active:scale-95 flex items-center justify-center gap-1 w-28"
                            >
                              <Undo2 size={14} /> Reverse
                            </button>
                            <button
                              onClick={() => openEditCompletedModal(p)}
                              className="bg-gray-100 text-gray-700 border border-gray-300 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-gray-200 active:scale-95 flex items-center justify-center gap-1 w-28"
                            >
                              <Edit size={14} /> Edit
                            </button>
                            <button
                              onClick={() => handleDeleteProcess(p)}
                              className="bg-red-50 text-red-600 border border-red-200 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-100 active:scale-95 flex items-center justify-center gap-1 w-28"
                            >
                              <Trash2 size={14} /> Delete
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => openViewModal(p.job_number)}
                          className="bg-white border border-gray-200 text-gray-600 hover:text-gray-800 hover:bg-gray-50 active:scale-95 flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors w-28"
                        >
                          <Eye size={14} /> View
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredProcesses.length === 0 && (
            <div className="p-8 text-center text-gray-400">
              No processes found.
            </div>
          )}
        </div>
      </div>

      {/* CREATE MODAL */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create Process Job"
      >
        <form
          onSubmit={handleCreateProcess}
          className={`space-y-4 ${isShaking ? "animate-shake" : ""}`}
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Stage
              </label>
              {isNextStep ? (
                <input
                  type="text"
                  className="w-full bg-gray-100 border border-gray-200 py-3 px-4 rounded-lg font-semibold text-gray-600 outline-none cursor-not-allowed"
                  value={createForm.stage}
                  readOnly
                />
              ) : (
                <select
                  className="w-full bg-blue-50 border border-blue-200 py-3 px-4 rounded-lg font-bold outline-none text-blue-800"
                  value={createForm.stage || "Rolling"}
                  onChange={(e) => {
                    const newStage = e.target.value;
                    let nextJobNum = createForm.job_number;
                    if (newStage === "Rolling") {
                      nextJobNum = createForm.original_next_job;
                    } else {
                      let prevStage = "Rolling";
                      if (newStage === "TPP") prevStage = "Press";
                      if (newStage === "Packing") prevStage = "TPP";
                      const available = [
                        ...new Set(
                          processes
                            .filter(
                              (p) =>
                                p.stage === prevStage &&
                                p.status === "COMPLETED",
                            )
                            .map((p) => p.job_number),
                        ),
                      ];
                      nextJobNum = available.length > 0 ? available[0] : "";
                    }

                    const parentJob = processes.find(
                      (p) => p.job_number === nextJobNum,
                    );

                    setCreateForm({
                      ...createForm,
                      stage: newStage,
                      job_number: nextJobNum || "",
                      ...(parentJob && newStage !== "Rolling"
                        ? {
                            metal_type: parentJob.metal_type,
                            category: parentJob.category,
                            weight_unit:
                              parentJob.metal_type === "Silver" ? "kg" : "g",
                          }
                        : {}),
                    });
                  }}
                >
                  <option value="Rolling">Rolling</option>
                  <option value="Press">Press</option>
                  <option value="TPP">TPP</option>
                  <option value="Packing">Packing</option>
                </select>
              )}
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Job Number
              </label>
              {isNextStep || createForm.stage === "Rolling" ? (
                <input
                  type="text"
                  className="w-full bg-gray-100 border border-gray-200 py-3 px-4 rounded-lg font-mono text-blue-800 font-bold outline-none cursor-not-allowed"
                  value={createForm.job_number}
                  readOnly
                />
              ) : (
                <select
                  className="w-full bg-blue-50 border border-blue-200 py-3 px-4 rounded-lg font-mono text-blue-800 font-bold outline-none uppercase"
                  value={createForm.job_number || ""}
                  onChange={(e) => {
                    const jn = e.target.value;
                    const parentJob = processes.find(
                      (p) => p.job_number === jn,
                    );
                    if (parentJob) {
                      setCreateForm({
                        ...createForm,
                        job_number: jn,
                        metal_type: parentJob.metal_type,
                        category: parentJob.category,
                        weight_unit:
                          parentJob.metal_type === "Silver" ? "kg" : "g",
                      });
                    } else {
                      setCreateForm({
                        ...createForm,
                        job_number: jn,
                      });
                    }
                  }}
                  required
                >
                  <option value="" disabled>
                    Select Job
                  </option>
                  {getAvailableJobNumbers().map((jn) => (
                    <option key={jn} value={jn}>
                      {jn}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Metal
              </label>
              {isNextStep || createForm.stage !== "Rolling" ? (
                <input
                  type="text"
                  className="w-full bg-gray-100 border border-gray-200 py-3 px-4 rounded-lg font-semibold text-gray-600 outline-none cursor-not-allowed"
                  value={createForm.metal_type}
                  readOnly
                />
              ) : (
                <select
                  className="w-full bg-gray-50 border border-gray-200 py-3 px-4 rounded-lg font-semibold outline-none"
                  value={createForm.metal_type}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      metal_type: e.target.value,
                      category: sizeOptions[e.target.value][0],
                      weight_unit: e.target.value === "Silver" ? "kg" : "g",
                    })
                  }
                >
                  <option value="Gold">Gold</option>
                  <option value="Silver">Silver</option>
                </select>
              )}
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Category
              </label>
              {isNextStep || createForm.stage !== "Rolling" ? (
                <input
                  type="text"
                  className="w-full bg-gray-100 border border-gray-200 py-3 px-4 rounded-lg font-semibold text-gray-600 outline-none cursor-not-allowed"
                  value={createForm.category || "N/A"}
                  readOnly
                />
              ) : (
                <select
                  className="w-full bg-gray-50 border border-gray-200 py-3 px-4 rounded-lg font-semibold outline-none"
                  value={createForm.category}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      category: e.target.value,
                    })
                  }
                >
                  {sizeOptions[createForm.metal_type]?.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">
              Issue Size (Taken from previous pool)
            </label>
            <div className="flex bg-gray-50 border border-gray-200 rounded-lg focus-within:border-blue-500 overflow-hidden">
              <input
                type="number"
                step="0.001"
                required
                className="w-full bg-transparent py-3 px-4 font-bold text-lg outline-none"
                value={createForm.issue_size}
                onChange={(e) =>
                  setCreateForm({ ...createForm, issue_size: e.target.value })
                }
                placeholder="0.000"
              />
              <select
                className="bg-gray-100 border-l border-gray-200 px-3 font-bold text-gray-600 outline-none"
                value={createForm.weight_unit}
                onChange={(e) =>
                  setCreateForm({ ...createForm, weight_unit: e.target.value })
                }
              >
                <option value="g">g</option>
                <option value="kg">kg</option>
              </select>
            </div>
          </div>
          <button
            type="submit"
            className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl hover:bg-blue-700 flex justify-center gap-2"
          >
            <PlusCircle size={20} /> Create & Queue
          </button>
        </form>
      </Modal>

      {/* START MODAL */}
      <Modal
        isOpen={isStartModalOpen}
        onClose={() => setIsStartModalOpen(false)}
        title={`Start ${selectedProcess?.stage}`}
      >
        <form
          onSubmit={handleStartProcess}
          className={`space-y-4 ${isShaking ? "animate-shake" : ""}`}
        >
          <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-200">
            <label className="block text-sm font-bold text-yellow-800 mb-2">
              Actual Weigh-In (Issued Weight)
            </label>
            <div className="flex bg-white border border-yellow-300 rounded-lg overflow-hidden">
              <input
                type="number"
                step="0.001"
                required
                className="w-full bg-transparent py-3 px-4 font-bold text-lg text-yellow-900 outline-none"
                value={startForm.issued_weight}
                onChange={(e) =>
                  setStartForm({ ...startForm, issued_weight: e.target.value })
                }
                placeholder="0.000"
              />
              <select
                className="bg-yellow-100 border-l border-yellow-300 px-3 font-bold text-yellow-900 outline-none"
                value={startForm.weight_unit}
                onChange={(e) =>
                  setStartForm({ ...startForm, weight_unit: e.target.value })
                }
              >
                <option value="g">g</option>
                <option value="kg">kg</option>
              </select>
            </div>
          </div>
          <button
            type="submit"
            className="w-full bg-orange-500 text-white font-bold py-3.5 rounded-xl hover:bg-orange-600 flex justify-center gap-2"
          >
            <PlayCircle size={20} /> Start Engine
          </button>
        </form>
      </Modal>

      {/* COMPLETE MODAL */}
      <Modal
        isOpen={isCompleteModalOpen}
        onClose={() => setIsCompleteModalOpen(false)}
        title={`Complete ${selectedProcess?.stage}`}
      >
        <form
          onSubmit={handleCompleteProcess}
          className={`space-y-4 ${isShaking ? "animate-shake" : ""}`}
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 bg-indigo-50 p-3 rounded-lg border border-indigo-100 flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-indigo-700 uppercase tracking-wide">
                Category
              </span>
              <span className="text-sm font-black text-indigo-900">
                {selectedProcess?.category || "N/A"}
              </span>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-bold text-gray-700 mb-2 uppercase tracking-wide">
                Weight Unit
              </label>
              <div className="flex bg-gray-100 p-1 rounded-lg mb-2">
                <button
                  type="button"
                  onClick={() =>
                    setCompleteForm({ ...completeForm, weight_unit: "g" })
                  }
                  className={`flex-1 py-2 text-sm font-bold rounded-md transition-colors ${completeForm?.weight_unit === "g" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                >
                  Grams (g)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setCompleteForm({ ...completeForm, weight_unit: "kg" })
                  }
                  className={`flex-1 py-2 text-sm font-bold rounded-md transition-colors ${completeForm?.weight_unit === "kg" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                >
                  Kilogram (kg)
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-green-700 mb-1 uppercase">
                Good Output
              </label>
              <input
                type="number"
                step="0.001"
                required
                className="w-full bg-green-50 border border-green-200 py-3 px-4 rounded-lg font-bold text-lg outline-none"
                value={completeForm.return_weight}
                onChange={(e) =>
                  setCompleteForm({
                    ...completeForm,
                    return_weight: e.target.value,
                  })
                }
                placeholder="0.000"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">
                Scrap/Dust
              </label>
              <input
                type="number"
                step="0.001"
                className="w-full bg-gray-50 border border-gray-200 py-3 px-4 rounded-lg font-bold text-lg outline-none"
                value={completeForm.scrap_weight}
                onChange={(e) =>
                  setCompleteForm({
                    ...completeForm,
                    scrap_weight: e.target.value,
                  })
                }
                placeholder="0.000"
              />
            </div>
          </div>
          {reqPieces && (
            <div>
              <label className="block text-xs font-bold text-purple-700 mb-1 uppercase">
                Final Pieces
              </label>
              <input
                type="number"
                step="1"
                required
                className="w-full bg-purple-50 border border-purple-200 py-3 px-4 rounded-lg font-bold text-lg outline-none"
                value={completeForm.return_pieces}
                onChange={(e) =>
                  setCompleteForm({
                    ...completeForm,
                    return_pieces: e.target.value,
                  })
                }
                placeholder="0"
              />
            </div>
          )}
          <div className="bg-gray-800 text-gray-200 p-4 rounded-xl font-mono shadow-inner mt-4">
            <div className="flex justify-between text-sm mb-1">
              <span>Issued ({completeForm?.weight_unit || "g"}):</span>
              <span>
                {(
                  issVal / (completeForm?.weight_unit === "kg" ? 1000 : 1)
                ).toFixed(3)}
              </span>
            </div>
            <div className="flex justify-between text-sm mb-1 text-green-400">
              <span>- Return:</span>
              <span>
                {(
                  retVal / (completeForm?.weight_unit === "kg" ? 1000 : 1)
                ).toFixed(3)}
              </span>
            </div>
            <div className="flex justify-between text-sm mb-3 text-yellow-400">
              <span>- Scrap:</span>
              <span>
                {(
                  scrVal / (completeForm?.weight_unit === "kg" ? 1000 : 1)
                ).toFixed(3)}
              </span>
            </div>
            <div className="border-t border-gray-600 pt-3 flex justify-between font-bold">
              <span>Loss:</span>
              <span className={isLossNegative ? "text-red-500" : "text-white"}>
                {(
                  liveLoss / (completeForm?.weight_unit === "kg" ? 1000 : 1)
                ).toFixed(3)}
              </span>
            </div>
          </div>
          <button
            type="submit"
            disabled={isLossNegative}
            className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl hover:bg-blue-700 disabled:opacity-50"
          >
            Complete & Log
          </button>
        </form>
      </Modal>

      {/* EDIT MODAL */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={`Edit Weight: ${selectedProcess?.job_number}`}
      >
        <form
          onSubmit={handleEditProcess}
          className={`space-y-4 ${isShaking ? "animate-shake" : ""}`}
        >
          <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-200">
            <label className="block text-sm font-bold text-yellow-800 mb-2">
              New Issued Weight
            </label>
            <div className="flex bg-white border border-yellow-300 rounded-lg overflow-hidden">
              <input
                type="number"
                step="0.001"
                required
                className="w-full bg-transparent py-3 px-4 font-bold text-lg text-yellow-900 outline-none"
                value={editForm.issued_weight}
                onChange={(e) =>
                  setEditForm({ ...editForm, issued_weight: e.target.value })
                }
                placeholder="0.000"
              />
              <select
                className="bg-yellow-100 border-l border-yellow-300 px-3 font-bold text-yellow-900 outline-none"
                value={editForm.weight_unit}
                onChange={(e) =>
                  setEditForm({ ...editForm, weight_unit: e.target.value })
                }
              >
                <option value="g">g</option>
                <option value="kg">kg</option>
              </select>
            </div>
            <p className="text-xs text-yellow-700 mt-2 font-semibold">
              Note: Decreasing this will refund physical metric variants back to
              base inventory. Increasing this will deduct additional weight from
              pooling logic.
            </p>
          </div>
          <button
            type="submit"
            className="w-full bg-orange-500 text-white font-bold py-3.5 rounded-xl hover:bg-orange-600 flex justify-center gap-2"
          >
            <Edit size={20} /> Update Weight Database
          </button>
        </form>
      </Modal>

      {/* EDIT COMPLETED MODAL */}
      <Modal
        isOpen={isEditCompletedModalOpen}
        onClose={() => setIsEditCompletedModalOpen(false)}
        title={`Edit Completed: ${selectedProcess?.job_number} (${selectedProcess?.stage})`}
      >
        {selectedProcess && (() => {
          const ecIssW = selectedProcess.issued_weight || 0;
          let ecRetW = parseFloat(editCompletedForm.return_weight) || 0;
          let ecScrW = parseFloat(editCompletedForm.scrap_weight) || 0;
          if (editCompletedForm.weight_unit === "kg") { ecRetW *= 1000; ecScrW *= 1000; }
          const ecLoss = parseFloat((ecIssW - ecRetW - ecScrW).toFixed(3));
          const ecIsNeg = ecLoss < 0;
          const ecDivisor = editCompletedForm.weight_unit === "kg" ? 1000 : 1;
          return (
          <form
            onSubmit={handleEditCompletedProcess}
            className={`space-y-4 ${isShaking ? "animate-shake" : ""}`}
          >
            <div className="bg-green-50 p-3 rounded-xl border border-green-100 text-sm text-green-700 font-medium">
              Editing completed process — stock adjustments will be recalculated.
            </div>
            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex justify-between items-center">
              <span className="text-blue-800 font-semibold">Issued Weight ({editCompletedForm.weight_unit}):</span>
              <span className="text-xl font-bold text-blue-900">
                {(ecIssW / ecDivisor).toFixed(3)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-bold text-gray-700 mb-2 uppercase tracking-wide">Weight Unit</label>
                <div className="flex bg-gray-100 p-1 rounded-lg">
                  <button type="button" onClick={() => setEditCompletedForm({ ...editCompletedForm, weight_unit: "g" })} className={`flex-1 py-2 text-sm font-bold rounded-md transition-colors ${editCompletedForm.weight_unit === "g" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>Grams (g)</button>
                  <button type="button" onClick={() => setEditCompletedForm({ ...editCompletedForm, weight_unit: "kg" })} className={`flex-1 py-2 text-sm font-bold rounded-md transition-colors ${editCompletedForm.weight_unit === "kg" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>Kilogram (kg)</button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-green-700 mb-1 uppercase">Good Output</label>
                <input type="number" step="0.001" className="w-full bg-green-50 border border-green-200 py-3 px-4 rounded-lg font-bold text-lg outline-none" value={editCompletedForm.return_weight} onChange={(e) => setEditCompletedForm({ ...editCompletedForm, return_weight: e.target.value })} placeholder="0.000" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">Scrap/Dust</label>
                <input type="number" step="0.001" className="w-full bg-gray-50 border border-gray-200 py-3 px-4 rounded-lg font-bold text-lg outline-none" value={editCompletedForm.scrap_weight} onChange={(e) => setEditCompletedForm({ ...editCompletedForm, scrap_weight: e.target.value })} placeholder="0.000" />
              </div>
            </div>
            {(selectedProcess.stage === "TPP" || selectedProcess.stage === "Packing") && (
              <div>
                <label className="block text-xs font-bold text-purple-700 mb-1 uppercase">Final Pieces</label>
                <input type="number" step="1" className="w-full bg-purple-50 border border-purple-200 py-3 px-4 rounded-lg font-bold text-lg outline-none" value={editCompletedForm.return_pieces} onChange={(e) => setEditCompletedForm({ ...editCompletedForm, return_pieces: e.target.value })} placeholder="0" />
              </div>
            )}
            <div className="bg-gray-800 text-gray-200 p-4 rounded-xl font-mono shadow-inner mt-4">
              <div className="flex justify-between text-sm mb-1">
                <span>Issued ({editCompletedForm.weight_unit}):</span>
                <span>{(ecIssW / ecDivisor).toFixed(3)}</span>
              </div>
              <div className="flex justify-between text-sm mb-1 text-green-400">
                <span>- Return:</span>
                <span>{(ecRetW / ecDivisor).toFixed(3)}</span>
              </div>
              <div className="flex justify-between text-sm mb-3 text-yellow-400">
                <span>- Scrap:</span>
                <span>{(ecScrW / ecDivisor).toFixed(3)}</span>
              </div>
              <div className="border-t border-gray-600 pt-3 flex justify-between font-bold">
                <span>Loss:</span>
                <span className={ecIsNeg ? "text-red-500" : "text-white"}>
                  {(ecLoss / ecDivisor).toFixed(3)}
                </span>
              </div>
            </div>
            <button type="submit" disabled={actionLoading || ecIsNeg} className="w-full bg-green-600 text-white font-bold py-3.5 rounded-xl hover:bg-green-700 disabled:opacity-50 flex justify-center gap-2">
              <CheckCircle size={20} /> {actionLoading ? "Updating..." : "Update Completed Process"}
            </button>
          </form>
          );
        })()}
      </Modal>

      {/* REVERSE CONFIRMATION MODAL */}
      <Modal
        isOpen={isReverseModalOpen}
        onClose={() => { setIsReverseModalOpen(false); setReversingProcess(null); }}
        title="Reverse Process"
      >
        {reversingProcess && (
          <div className="space-y-5">
            <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 text-center">
              <Undo2 size={40} className="mx-auto mb-3 text-amber-500" />
              <p className="text-amber-800 font-bold text-lg mb-1">Reverse this process?</p>
              <p className="text-amber-700 text-sm">
                This will reverse <strong>{reversingProcess.job_number}</strong> at the <strong>{reversingProcess.stage}</strong> stage
                and return weight to the <strong>{reversingProcess.stage === "Rolling" ? "Dhal" : reversingProcess.stage === "Press" ? "Rolling" : reversingProcess.stage === "TPP" ? "Press" : "TPP"}</strong> stock pool.
              </p>
            </div>
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-gray-500">Metal:</span><span className="font-bold">{reversingProcess.metal_type}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Issued Weight:</span><span className="font-bold">{reversingProcess.issued_weight?.toFixed(3)}g</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Return Weight:</span><span className="font-bold text-green-600">{reversingProcess.return_weight?.toFixed(3)}g</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Loss:</span><span className="font-bold text-red-600">{reversingProcess.loss_weight?.toFixed(3)}g</span></div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setIsReverseModalOpen(false); setReversingProcess(null); }} className="flex-1 bg-gray-100 text-gray-700 font-bold py-3 rounded-xl hover:bg-gray-200 transition-colors">Cancel</button>
              <button onClick={handleReverseProcess} disabled={actionLoading} className="flex-1 bg-amber-600 text-white font-bold py-3 rounded-xl hover:bg-amber-700 shadow-md active:scale-95 transition-all flex justify-center items-center gap-2 disabled:opacity-50">
                <Undo2 size={18} /> {actionLoading ? "Reversing..." : "Reverse"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ProductionJobs;

