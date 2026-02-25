import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Clock,
  History,
  CheckCircle,
  Activity,
  Box,
  PlayCircle,
  Hammer,
  Trash2,
  ArrowRightCircle,
  PlusCircle,
} from "lucide-react";
import {
  getCombinedProcesses,
  startProcess,
  completeProcess,
  deleteProcess,
  editProcess,
  createProcess,
} from "../api/jobService";
import Modal from "../components/Modal";
import Toast from "../components/Toast";

const JobHistory = () => {
  const { jobNumber } = useParams();
  const navigate = useNavigate();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    try {
      const result = await getCombinedProcesses();
      if (result.success) {
        let jobHistory = result.data.filter((p) => p.job_number === jobNumber);
        const stagePriority = { Rolling: 1, Press: 2, TPP: 3, Packing: 4 };
        jobHistory.sort(
          (a, b) => stagePriority[a.stage] - stagePriority[b.stage],
        );
        setHistory(jobHistory);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [jobNumber]);

  const [isStartModalOpen, setIsStartModalOpen] = useState(false);
  const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);
  const [selectedProcess, setSelectedProcess] = useState(null);
  const [toast, setToast] = useState(null);
  const [isShaking, setIsShaking] = useState(false);

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

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isNextStep, setIsNextStep] = useState(false);
  const [createForm, setCreateForm] = useState({
    stage: "Rolling",
    job_number: "",
    metal_type: "Gold",
    category: "N/A",
    issue_size: "",
    weight_unit: "g",
  });

  const showToast = (message, type) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const triggerError = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 500);
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
      fetchHistory();
    } catch (error) {
      triggerError();
      showToast(error.message, "error");
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
      fetchHistory();
    } catch (error) {
      triggerError();
      showToast(error.message, "error");
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
      fetchHistory();
    } catch (error) {
      showToast(error.message || "Failed to delete job", "error");
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
      fetchHistory();
    } catch (error) {
      triggerError();
      showToast(error.message || "Failed to edit job", "error");
    }
  };

  const openNextStepModal = (process) => {
    let nextStage = "Rolling";
    if (process.stage === "Rolling") nextStage = "Press";
    if (process.stage === "Press") nextStage = "TPP";
    if (process.stage === "TPP") nextStage = "Packing";

    setCreateForm({
      stage: nextStage,
      job_number: process.job_number,
      metal_type: process.metal_type,
      category: process.category,
      issue_size: "",
      weight_unit: process.metal_type === "Silver" ? "kg" : "g",
    });
    setIsNextStep(true);
    setIsCreateModalOpen(true);
  };

  const handleCreateProcess = async (e) => {
    e.preventDefault();
    let size = parseFloat(createForm.issue_size);
    if (createForm.weight_unit === "kg") size *= 1000;

    if (!size || size <= 0) {
      triggerError();
      return showToast("Invalid issue size", "error");
    }
    try {
      await createProcess(createForm.stage, {
        ...createForm,
        issue_size: size,
      });
      showToast("Process Created!", "success");
      setIsCreateModalOpen(false);
      fetchHistory();
    } catch (error) {
      triggerError();
      showToast(error.message || "Failed to create process", "error");
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

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

  const hasNextStage = (currentStage) => {
    let nextStage = null;
    if (currentStage === "Rolling") nextStage = "Press";
    if (currentStage === "Press") nextStage = "TPP";
    if (currentStage === "TPP") nextStage = "Packing";
    if (!nextStage) return false;
    return history.some((p) => p.stage === nextStage);
  };

  if (loading)
    return (
      <div className="p-10 text-center animate-pulse">
        Loading Job Details...
      </div>
    );

  return (
    <div className="p-6 relative max-w-7xl mx-auto">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
      <button
        onClick={() => navigate("/production")}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-800 font-bold mb-6 transition-colors"
      >
        <ArrowLeft size={20} /> Back to Production Floor
      </button>

      <div className="flex items-center gap-3 mb-8">
        <div className="bg-blue-100 p-3 rounded-xl text-blue-600">
          <History size={28} />
        </div>
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
            Timeline: {jobNumber}
          </h1>
          <p className="text-gray-500 font-medium">
            Complete Stage Progression History
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {history.length === 0 ? (
          <div className="p-10 text-center text-gray-500">
            No historical records found for this Job Number.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-sm uppercase tracking-wider relative">
                  <th className="p-5 font-bold border-b border-gray-100">
                    Stage
                  </th>
                  <th className="p-5 font-bold border-b border-gray-100">
                    Status
                  </th>
                  <th className="p-5 font-bold border-b border-gray-100">
                    Updated Date
                  </th>
                  <th className="p-5 font-bold border-b border-gray-100">
                    Issue Weight
                  </th>
                  <th className="p-5 font-bold border-b border-gray-100">
                    Return Weight
                  </th>
                  <th className="p-5 font-bold border-b border-gray-100">
                    Scrap Weight
                  </th>
                  <th className="p-5 font-bold border-b border-gray-100 text-red-500">
                    Loss
                  </th>
                  <th className="p-5 font-bold border-b border-gray-100 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, index) => (
                  <tr
                    key={`${h.stage}-${h.id}`}
                    className="hover:bg-gray-50 transition-colors border-b border-gray-50"
                  >
                    <td className="p-5 font-bold text-gray-800 flex items-center gap-2">
                      <span className="bg-gray-200 text-gray-700 w-6 h-6 flex items-center justify-center rounded-full text-xs">
                        {index + 1}
                      </span>
                      {h.stage}
                    </td>
                    <td className="p-5">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1 w-max ${h.status === "PENDING" ? "bg-orange-50 text-orange-700 border-orange-200" : h.status === "RUNNING" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-green-50 text-green-700 border-green-200"}`}
                      >
                        {h.status === "COMPLETED" ? (
                          <CheckCircle size={12} />
                        ) : h.status === "RUNNING" ? (
                          <Activity size={12} />
                        ) : (
                          <Clock size={12} />
                        )}
                        {h.status}
                      </span>
                    </td>
                    <td className="p-5 text-gray-500 text-sm">
                      {new Date(h.date).toLocaleDateString()}{" "}
                      {new Date(h.date).toLocaleTimeString()}
                    </td>
                    <td className="p-5 font-black text-gray-700">
                      {h.issued_weight
                        ? h.issued_weight.toFixed(3)
                        : (h.issue_size || 0).toFixed(3)}
                      g
                    </td>
                    <td className="p-5 font-black text-green-600">
                      {h.return_weight ? h.return_weight.toFixed(3) + "g" : "-"}
                    </td>
                    <td className="p-5 font-black text-gray-600">
                      {h.scrap_weight ? h.scrap_weight.toFixed(3) + "g" : "-"}
                    </td>
                    <td className="p-5 font-black text-red-500">
                      {h.loss_weight ? h.loss_weight.toFixed(3) + "g" : "-"}
                    </td>
                    <td className="p-5 flex justify-end gap-2">
                      {h.status === "PENDING" && (
                        <button
                          onClick={() => openStartModal(h)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 text-white rounded font-bold hover:bg-orange-600 transition-colors w-28 justify-center shadow-sm"
                        >
                          <PlayCircle size={16} /> Start
                        </button>
                      )}

                      {h.status === "RUNNING" && (
                        <>
                          <button
                            onClick={() => openCompleteModal(h)}
                            className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-700 active:scale-95 flex items-center justify-center gap-1 w-28"
                          >
                            <Hammer size={14} /> Complete
                          </button>
                          <button
                            onClick={() => openEditModal(h)}
                            className="bg-gray-100 text-gray-700 border border-gray-300 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-gray-200 active:scale-95 flex items-center justify-center gap-1 w-28"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="lucide lucide-edit"
                            >
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>{" "}
                            Edit Weight
                          </button>
                        </>
                      )}

                      {h.status === "COMPLETED" && (
                        <>
                          {h.stage !== "Packing" && !hasNextStage(h.stage) && (
                            <button
                              onClick={() => openNextStepModal(h)}
                              className="bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-200 active:scale-95 flex items-center justify-center gap-1 w-28"
                            >
                              <ArrowRightCircle size={14} /> Start Next
                            </button>
                          )}
                          <div className="w-28 flex justify-center text-green-500">
                            <CheckCircle size={20} />
                          </div>
                        </>
                      )}
                      <button
                        onClick={() => handleDeleteProcess(h)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 rounded font-bold hover:bg-red-100 transition-colors shadow-sm"
                        title="Delete Process Row"
                      >
                        <Trash2 size={16} /> Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
                          history
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

                    const parentJob = history.find(
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
                    const parentJob = history.find((p) => p.job_number === jn);
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
                  <option value={createForm.job_number}>
                    {createForm.job_number}
                  </option>
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
                <input
                  type="text"
                  className="w-full bg-gray-50 border border-gray-200 py-3 px-4 rounded-lg font-semibold outline-none"
                  value={createForm.category}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      category: e.target.value,
                    })
                  }
                />
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
            <PlusCircle size={20} /> Create & Queue Next Stage
          </button>
        </form>
      </Modal>

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
            Update Weight Database
          </button>
        </form>
      </Modal>
    </div>
  );
};

export default JobHistory;
