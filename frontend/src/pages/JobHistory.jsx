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
  Printer,
} from "lucide-react";
import {
  getCombinedProcesses,
  startProcess,
  completeProcess,
  deleteProcess,
  editProcess,
  createProcess,
  revertProcess,
} from "../api/jobService";
import { ArrowDownLeft } from "lucide-react";
import Modal from "../components/Modal";
import Toast from "../components/Toast";
import ConfirmModal from "../components/ConfirmModal";
import { formatWeight } from "../utils/formatHelpers";
import { useAuth } from "../context/AuthContext";

const sizeOptions = {
  Gold: [
    "0.05gm",
    "0.100gm",
    "0.250gm",
    "0.500gm",
    "1 gm",
    "2 gm",
    "5 gm",
    "10 gm",
    "20 gm",
    "25 gm",
    "50 gm",
    "100 gm",
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
    "250 gm",
    "500 gm",
  ],
};

const JobHistory = () => {
  const { jobNumber } = useParams();
  const navigate = useNavigate();
  const [history, setHistory] = useState([]);
  const [allProcesses, setAllProcesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);

  const { isAdmin } = useAuth();

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
        setAllProcesses(result.data);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }

    const fetchUsers = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(
          `${import.meta.env.VITE_API_URL || "http://localhost:3000/api"}/auth/users`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        const data = await res.json();
        if (Array.isArray(data)) {
          setUsers(data);
        }
      } catch (err) {
        console.error("Failed to fetch users");
      }
    };
    fetchUsers();
  }, [jobNumber]);

  const [isStartModalOpen, setIsStartModalOpen] = useState(false);
  const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedProcess, setSelectedProcess] = useState(null);
  const [toast, setToast] = useState(null);
  const [isShaking, setIsShaking] = useState(false);
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
    isDestructive: false,
    confirmText: "Confirm",
  });

  const [startForm, setStartForm] = useState({
    issued_weight: "",
    issue_pieces: "",
    weight_unit: "g",
    description: "",
  });

  const [completeForm, setCompleteForm] = useState({
    return_weight: "",
    scrap_weight: "",
    return_pieces: "",
    weight_unit: "g",
    description: "",
  });

  const [editForm, setEditForm] = useState({
    issued_weight: "",
    weight_unit: "g",
    description: "",
  });

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isNextStep, setIsNextStep] = useState(false);
  const [createForm, setCreateForm] = useState({
    stage: "Rolling",
    job_number: "",
    metal_type: "Gold",
    category: "N/A",
    issue_size: "",
    issue_pieces: "",
    weight_unit: "g",
    description: "",
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
          ? parseFloat((process.issue_size / 1000).toFixed(10)).toString()
          : process.issue_size || "",
      issue_pieces: process.issue_pieces || "",
      weight_unit: process.metal_type === "Silver" ? "kg" : "g",
      description: "",
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
      await startProcess(selectedProcess.stage, {
        process_id: selectedProcess.id,
        issued_weight: weight,
        issue_pieces: startForm.issue_pieces || 0,
        description: startForm.description || "",
      });
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
      description: "",
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

    try {
      await completeProcess(selectedProcess.stage, {
        process_id: selectedProcess.id,
        return_weight: retW,
        scrap_weight: scrW,
        return_pieces: parseInt(completeForm.return_pieces) || 0,
        description: completeForm.description || "",
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
    setConfirmModal({
      isOpen: true,
      title: "Delete Process",
      message: `Are you SURE you want to permanently delete the ${process.status} Job ${process.job_number} at the ${process.stage} stage? This will entirely reverse the stock math and return physical metals back to their raw states.`,
      isDestructive: true,
      confirmText: "Yes, Delete It",
      onConfirm: async () => {
        try {
          await deleteProcess(process.stage, process.id);
          showToast("Job Deleted and Stock Reversed!", "success");
          fetchHistory();
        } catch (error) {
          showToast(error.message || "Failed to delete job", "error");
        }
      },
    });
  };

  const handleRevertProcess = async (process) => {
    setConfirmModal({
      isOpen: true,
      title: "Revert Process",
      message: `Are you sure you want to REVERT Job ${process.job_number}? This will un-do the current stage and step backwards, restoring stock correctly.`,
      isDestructive: false,
      confirmText: "Revert Now",
      onConfirm: async () => {
        try {
          await revertProcess(process.stage, process.id);
          showToast("Job Successfully Reverted!", "success");
          fetchHistory();
        } catch (error) {
          showToast(error.message || "Failed to revert job", "error");
        }
      },
    });
  };

  const openEditModal = (process) => {
    setSelectedProcess(process);
    const isSil = process.metal_type === "Silver";
    const div = isSil ? 1000 : 1;
    setEditForm({
      issued_weight: process.issued_weight
        ? parseFloat((process.issued_weight / div).toFixed(10)).toString()
        : "",
      return_weight:
        process.return_weight !== null && process.return_weight !== undefined
          ? parseFloat((process.return_weight / div).toFixed(10)).toString()
          : "",
      scrap_weight:
        process.scrap_weight !== null && process.scrap_weight !== undefined
          ? parseFloat((process.scrap_weight / div).toFixed(10)).toString()
          : "",
      issue_pieces: process.issue_pieces || "",
      return_pieces: process.return_pieces || "",
      weight_unit: isSil ? "kg" : "g",
      category: process.category || "",
      description: process.description || "",
      employee: process.employee || "",
    });
    setIsEditModalOpen(true);
  };

  const handleEditProcess = async (e) => {
    e.preventDefault();
    let issueW = parseFloat(editForm.issued_weight);
    if (!issueW || issueW <= 0) {
      triggerError();
      return showToast("Invalid issued weight", "error");
    }
    const isKg = editForm.weight_unit === "kg";
    if (isKg) issueW *= 1000;

    let payload = {
      issued_weight: issueW,
      issue_pieces: editForm.issue_pieces,
      category: editForm.category,
    };
    if (editForm.description !== undefined) {
      payload.description = editForm.description;
    }
    if (editForm.employee !== undefined) {
      payload.employee = editForm.employee;
    }

    if (
      selectedProcess?.status === "COMPLETED" ||
      selectedProcess?.status === "RUNNING"
    ) {
      let retW = parseFloat(editForm.return_weight) || 0;
      let scrW = parseFloat(editForm.scrap_weight) || 0;
      if (isKg) {
        retW *= 1000;
        scrW *= 1000;
      }
      payload.return_weight = retW;
      payload.scrap_weight = scrW;
      payload.return_pieces = editForm.return_pieces;
    }

    try {
      await editProcess(selectedProcess.stage, selectedProcess.id, payload);
      showToast("Job Updated Successfully!", "success");
      setIsEditModalOpen(false);
      fetchHistory();
    } catch (error) {
      triggerError();
      showToast(error.message || "Failed to edit job", "error");
    }
  };

  const openNextStepModal = (process, remainingWeight) => {
    let nextStage = "Rolling";
    if (process.stage === "Rolling") nextStage = "Press";
    if (process.stage === "Press") nextStage = "TPP";
    if (process.stage === "TPP") nextStage = "Packing";

    setCreateForm({
      stage: nextStage,
      job_number: process.job_number,
      metal_type: process.metal_type,
      category: process.category,
      issue_size:
        process.metal_type === "Silver"
          ? parseFloat((remainingWeight / 1000).toFixed(10)).toString()
          : parseFloat(remainingWeight.toFixed(10)).toString(),
      issue_pieces: process.return_pieces || "",
      weight_unit: process.metal_type === "Silver" ? "kg" : "g",
      description: process.description || "",
    });
    setIsNextStep(true);
    setIsCreateModalOpen(true);
  };

  const openViewModal = (process) => {
    setSelectedProcess(process);
    setIsViewModalOpen(true);
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
        issue_pieces: parseInt(createForm.issue_pieces) || 0,
        description: createForm.description || "",
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

  const reqPieces = false;
  const issVal = selectedProcess
    ? parseFloat(selectedProcess.issued_weight) || 0
    : 0;
  let retVal = parseFloat(completeForm.return_weight) || 0;
  let scrVal = parseFloat(completeForm.scrap_weight) || 0;

  if (completeForm?.weight_unit === "kg") {
    retVal *= 1000;
    scrVal *= 1000;
  }
  const liveLoss = parseFloat((issVal - retVal - scrVal).toFixed(10));
  const isLossNegative = liveLoss < 0;

  const getRemainingStockForRow = (row, historyItems, allItems) => {
    let nextStage = null;
    if (row.stage === "Rolling") nextStage = "Press";
    if (row.stage === "Press") nextStage = "TPP";
    if (row.stage === "TPP") nextStage = "Packing";
    if (!nextStage) return 0;

    let stageReturns = historyItems
      .filter((p) => p.stage === row.stage && p.status === "COMPLETED")
      .map((p) => ({ ...p, remaining: parseFloat(p.return_weight) || 0 }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let consumedItems = allItems
      .filter((p) => p.stage === nextStage && p.job_number === row.job_number)
      .map((p) => parseFloat(p.issued_weight || p.issue_size || 0));

    for (let i = 0; i < consumedItems.length; i++) {
      let c = consumedItems[i];
      if (c <= 0) continue;

      let exactMatchIndex = stageReturns.findIndex(
        (r) => Math.abs(r.remaining - c) < 0.001,
      );
      if (exactMatchIndex !== -1) {
        stageReturns[exactMatchIndex].remaining = 0;
        consumedItems[i] = 0;
      }
    }

    let totalConsumed = consumedItems.reduce((sum, c) => sum + c, 0);

    for (let r of stageReturns) {
      if (totalConsumed <= 0) break;
      if (r.remaining <= 0) continue;

      if (totalConsumed >= r.remaining) {
        totalConsumed -= r.remaining;
        r.remaining = 0;
      } else {
        r.remaining -= totalConsumed;
        totalConsumed = 0;
      }
    }

    const targetRow = stageReturns.find((r) => r.id === row.id);
    return targetRow ? parseFloat(targetRow.remaining.toFixed(10)) : 0;
  };

  if (loading)
    return (
      <div className="p-10 text-center animate-pulse">
        Loading Job Details...
      </div>
    );

  return (
    <div className="p-6 relative w-full">
      <div className="print:hidden">
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

        <div className="flex justify-between items-start mb-8 print:hidden">
          <div className="flex items-center gap-3">
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

          <div className="flex items-center gap-6">
            {history.length > 0 && (
              <div className="flex gap-4">
                <div className="bg-white px-4 py-2 rounded-xl border border-gray-100 shadow-xs text-right">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">
                    Net Job {history.reduce((sum, h) => sum + (h.loss_weight || 0), 0) < 0 ? "Gain" : "Loss"}
                  </p>
                  {(() => {
                    const totalLoss = history.reduce((sum, h) => sum + (h.loss_weight || 0), 0);
                    const isGain = totalLoss < 0;
                    const unit = history[0]?.unit || (history[0]?.metal_type === "Silver" ? "kg" : "g");
                    return (
                      <p className={`text-xl font-black ${isGain ? "text-green-600" : totalLoss > 0 ? "text-red-600" : "text-gray-400"}`}>
                        {isGain ? "+" : ""}{formatWeight(Math.abs(totalLoss), unit)}
                      </p>
                    );
                  })()}
                </div>
                <div className="bg-white px-4 py-2 rounded-xl border border-gray-100 shadow-xs text-right">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">
                    Total Scrap
                  </p>
                  <p className="text-xl font-black text-amber-600">
                    {formatWeight(history.reduce((sum, h) => sum + (h.scrap_weight || 0), 0), history[0]?.unit || (history[0]?.metal_type === "Silver" ? "kg" : "g"))}
                  </p>
                </div>
              </div>
            )}
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 bg-gray-800 text-white px-5 py-2.5 rounded-lg font-bold hover:bg-gray-900 transition-colors shadow-sm cursor-pointer"
            >
              <Printer size={18} /> Print Job Sheet
            </button>
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
                    <th className="p-2 px-3 font-bold border-b border-gray-100">
                      Stage
                    </th>
                    <th className="p-2 px-3 font-bold border-b border-gray-100">
                      Status
                    </th>
                    <th className="p-2 px-3 font-bold border-b border-gray-100">
                      Operator / Date
                    </th>
                    <th className="p-2 px-3 font-bold border-b border-gray-100">
                      Issue Weight
                    </th>
                    <th className="p-2 px-3 font-bold border-b border-gray-100">
                      Return Weight
                    </th>
                    <th className="p-2 px-3 font-bold border-b border-gray-100">
                      Scrap Weight
                    </th>
                    <th className="p-2 px-3 font-bold border-b border-gray-100 text-gray-700">
                      Loss / Gain
                    </th>
                    <th className="p-2 px-3 font-bold border-b border-gray-100 text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h, index) => (
                    <tr
                      key={`${h.stage}-${h.id}`}
                      onClick={() => openViewModal(h)}
                      className="hover:bg-blue-50/80 transition-all cursor-pointer group/row border-b border-gray-100"
                    >
                      <td className="p-4 font-bold text-gray-800">
                        <div className="flex items-center gap-2">
                          <span className="bg-gray-200 text-gray-700 w-6 h-6 flex items-center justify-center rounded-full text-xs group-hover:bg-blue-200 group-hover:text-blue-800 transition-colors">
                            {index + 1}
                          </span>
                          {h.stage}
                        </div>
                        {h.description && (
                          <div
                            className="text-[10px] text-gray-400 font-normal mt-1 italic max-w-37.5 truncate"
                            title={h.description}
                          >
                            {h.description}
                          </div>
                        )}
                      </td>
                      <td className="p-4">
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
                      <td className="p-4 text-gray-500 text-sm whitespace-nowrap">
                        <div className="font-bold text-blue-800 mb-0.5 flex items-center gap-1.5">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                          </svg>
                          {h.employee || "Unknown"}
                        </div>
                        <div className="text-xs text-gray-400 font-medium mt-1 uppercase tracking-wider">
                          {new Date(h.date).toLocaleDateString()}{" "}
                          {new Date(h.date).toLocaleTimeString()}
                        </div>
                      </td>
                      <td className="p-4 font-black text-gray-700 whitespace-nowrap">
                        {formatWeight(
                          h.issued_weight ? h.issued_weight : h.issue_size || 0,
                          h.unit,
                        )}
                      </td>
                      <td className="p-4 font-black text-green-600 whitespace-nowrap">
                        {h.return_weight !== null
                          ? formatWeight(h.return_weight, h.unit)
                          : "-"}
                      </td>
                      <td className="p-4 font-black text-gray-600 whitespace-nowrap">
                        {h.scrap_weight !== null
                          ? formatWeight(h.scrap_weight, h.unit)
                          : "-"}
                      </td>
                      <td
                        className={`p-4 font-black whitespace-nowrap ${h.loss_weight !== null && h.loss_weight < 0 ? "text-green-600" : "text-red-500"}`}
                      >
                        {h.loss_weight !== null
                          ? (h.loss_weight < 0 ? "+" : "") +
                            formatWeight(Math.abs(h.loss_weight), h.unit)
                          : "-"}
                        {h.loss_weight !== null && h.loss_weight < 0 && (
                          <span className="text-xs ml-1 font-bold">(Gain)</span>
                        )}
                      </td>
                      <td className="p-4 flex justify-end gap-2 text-sm">
                        {h.status === "PENDING" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openStartModal(h);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 text-white rounded font-bold hover:bg-orange-600 transition-colors justify-center shadow-sm whitespace-nowrap"
                          >
                            <PlayCircle size={16} /> Start
                          </button>
                        )}

                        {h.status === "RUNNING" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openCompleteModal(h);
                            }}
                            className="bg-blue-600 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-blue-700 active:scale-95 flex items-center justify-center gap-1 whitespace-nowrap"
                          >
                            <Hammer size={14} /> Complete
                          </button>
                        )}

                        {h.status === "COMPLETED" && (
                          <>
                            {h.stage !== "Packing" &&
                              getRemainingStockForRow(
                                h,
                                history,
                                allProcesses,
                              ) > 0.001 && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openNextStepModal(
                                      h,
                                      getRemainingStockForRow(
                                        h,
                                        history,
                                        allProcesses,
                                      ),
                                    );
                                  }}
                                  className="bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg font-bold hover:bg-blue-200 active:scale-95 flex items-center justify-center gap-1 whitespace-nowrap"
                                >
                                  <ArrowRightCircle size={14} /> Start Next
                                </button>
                              )}
                            <div className="w-8 flex justify-center items-center text-green-500">
                              <CheckCircle size={20} />
                            </div>
                          </>
                        )}
                        {isAdmin && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditModal(h);
                            }}
                            className="bg-gray-100 text-gray-700 border border-gray-300 px-3 py-1.5 rounded-lg font-bold hover:bg-gray-200 active:scale-95 flex items-center justify-center gap-1 whitespace-nowrap"
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
                            </svg>
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteProcess(h);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded font-bold hover:bg-red-100 transition-colors shadow-sm whitespace-nowrap"
                            title="Delete Process Row"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRevertProcess(h);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 text-purple-600 border border-purple-200 rounded font-bold hover:bg-purple-100 transition-colors shadow-sm whitespace-nowrap"
                            title="Revert Job Backwards"
                          >
                            <ArrowDownLeft size={16} />
                          </button>
                        )}
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
          title="Create Next Job"
          maxWidth="max-w-2xl"
        >
          <form
            onSubmit={handleCreateProcess}
            className={`space-y-5 ${isShaking ? "animate-shake" : ""}`}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              <div className="col-span-1">
                <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                  Stage
                </label>
                {isNextStep || true ? (
                  <input
                    type="text"
                    className="w-full bg-gray-100 border border-gray-200 py-2.5 px-3 rounded-lg font-bold text-gray-600 outline-none cursor-not-allowed"
                    value={createForm.stage}
                    readOnly
                  />
                ) : (
                  <select
                    className="w-full bg-blue-50 border border-blue-200 py-2.5 px-3 rounded-lg font-bold outline-none text-blue-800 transition-colors focus:border-blue-500 focus:bg-white"
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

              <div className="col-span-1">
                <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                  Job Number
                </label>
                {isNextStep || createForm.stage === "Rolling" ? (
                  <input
                    type="text"
                    className="w-full bg-gray-100 border border-gray-200 py-2.5 px-3 rounded-lg font-mono text-blue-800 font-bold outline-none cursor-not-allowed"
                    value={createForm.job_number}
                    readOnly
                  />
                ) : (
                  <select
                    className="w-full bg-blue-50 border border-blue-200 py-2.5 px-3 rounded-lg font-mono text-blue-800 font-bold outline-none uppercase transition-colors focus:border-blue-500 focus:bg-white"
                    value={createForm.job_number || ""}
                    onChange={(e) => {
                      const jn = e.target.value;
                      const parentJob = history.find(
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
                    <option value={createForm.job_number}>
                      {createForm.job_number}
                    </option>
                  </select>
                )}
              </div>
              <div className="col-span-1">
                <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                  Metal
                </label>
                {isNextStep || true ? (
                  <input
                    type="text"
                    className="w-full bg-gray-100 border border-gray-200 py-2.5 px-3 rounded-lg font-bold text-gray-600 outline-none cursor-not-allowed"
                    value={createForm.metal_type}
                    readOnly
                  />
                ) : (
                  <select
                    className="w-full bg-gray-50 border border-gray-200 py-2.5 px-3 rounded-lg font-semibold outline-none"
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

              <div className="col-span-1">
                <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                  Category
                </label>
                <select
                  className="w-full bg-gray-50 border border-gray-200 py-2.5 px-3 rounded-lg font-bold outline-none cursor-pointer"
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
              </div>

              <div className="col-span-1">
                <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                  Issue Size (Previous Pool)
                </label>
                <div className="flex bg-gray-50 border border-gray-200 rounded-lg focus-within:border-blue-500 transition-colors overflow-hidden">
                  <input
                    type="number"
                    step="0.001"
                    required
                    className="w-full bg-transparent py-2.5 px-3 font-bold text-lg outline-none"
                    value={createForm.issue_size}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        issue_size: e.target.value,
                      })
                    }
                    placeholder="0.000"
                  />
                  <select
                    className="bg-gray-100 border-l border-gray-200 px-3 font-bold text-gray-600 outline-none cursor-pointer"
                    value={createForm.weight_unit}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        weight_unit: e.target.value,
                      })
                    }
                  >
                    <option value="g">g</option>
                    <option value="kg">kg</option>
                  </select>
                </div>
              </div>

              <div className="col-span-1">
                <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                  Issue Pieces{" "}
                  <span className="text-gray-400 font-normal tracking-normal">
                    (Optional)
                  </span>
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  className="w-full bg-gray-50 border border-gray-200 py-2.5 px-3 rounded-lg font-bold text-lg outline-none focus:bg-white focus:border-blue-500 transition-colors"
                  value={createForm.issue_pieces}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      issue_pieces: e.target.value,
                    })
                  }
                  placeholder="0"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                  Description / Notes{" "}
                  <span className="text-gray-400 font-normal tracking-normal">
                    (Optional)
                  </span>
                </label>
                <textarea
                  className="w-full bg-gray-50 border border-gray-200 py-2 px-3 text-sm rounded-lg outline-none focus:bg-white focus:border-blue-500 min-h-20 transition-colors"
                  value={createForm.description}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      description: e.target.value,
                    })
                  }
                  placeholder="Add any specific requirements or notes..."
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl hover:bg-blue-700 flex justify-center gap-2 transition-colors active:scale-95"
            >
              <PlusCircle size={20} /> Create & Queue Next Stage
            </button>
          </form>
        </Modal>

        <Modal
          isOpen={isStartModalOpen}
          onClose={() => setIsStartModalOpen(false)}
          title={`Start ${selectedProcess?.stage}`}
          maxWidth="max-w-2xl"
        >
          <form
            onSubmit={handleStartProcess}
            className={`space-y-5 ${isShaking ? "animate-shake" : ""}`}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              <div className="col-span-1 bg-yellow-50 p-4 rounded-xl border border-yellow-200">
                <label className="block text-xs font-bold text-yellow-800 mb-1.5 uppercase tracking-wide">
                  Actual Weigh-In (Issued)
                </label>
                <div className="flex bg-white border border-yellow-300 rounded-lg overflow-hidden focus-within:border-orange-500 transition-colors">
                  <input
                    type="number"
                    step="0.001"
                    required
                    className="w-full bg-transparent py-2.5 px-3 font-bold text-lg text-yellow-900 outline-none"
                    value={startForm.issued_weight}
                    onChange={(e) =>
                      setStartForm({
                        ...startForm,
                        issued_weight: e.target.value,
                      })
                    }
                    placeholder="0.000"
                  />
                  <select
                    className="bg-yellow-100 border-l border-yellow-300 px-3 font-bold text-yellow-900 outline-none"
                    value={startForm.weight_unit}
                    onChange={(e) =>
                      setStartForm({
                        ...startForm,
                        weight_unit: e.target.value,
                      })
                    }
                  >
                    <option value="g">g</option>
                    <option value="kg">kg</option>
                  </select>
                </div>
              </div>

              <div className="col-span-1 bg-yellow-50 p-4 rounded-xl border border-yellow-200">
                <label className="block text-xs font-bold text-yellow-800 mb-1.5 uppercase tracking-wide">
                  Actual Piece Count{" "}
                  <span className="text-yellow-600/70 font-normal tracking-normal">
                    (Optional)
                  </span>
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  className="w-full bg-white border border-yellow-300 py-2.5 px-3 rounded-lg font-bold text-lg text-yellow-900 outline-none focus:border-orange-500 transition-colors"
                  value={startForm.issue_pieces}
                  onChange={(e) =>
                    setStartForm({ ...startForm, issue_pieces: e.target.value })
                  }
                  placeholder="0"
                />
              </div>

              <div className="col-span-2 bg-yellow-50 p-4 rounded-xl border border-yellow-200">
                <label className="block text-xs font-bold text-yellow-800 mb-1.5 uppercase tracking-wide">
                  Description / Notes{" "}
                  <span className="text-yellow-600/70 font-normal tracking-normal">
                    (Optional)
                  </span>
                </label>
                <textarea
                  className="w-full bg-white border border-yellow-300 py-2 px-3 text-sm rounded-lg outline-none focus:border-orange-500 min-h-20 transition-colors"
                  value={startForm.description}
                  onChange={(e) =>
                    setStartForm({ ...startForm, description: e.target.value })
                  }
                  placeholder="Add any specific requirements or notes..."
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-orange-500 text-white font-bold py-3.5 rounded-xl hover:bg-orange-600 flex justify-center gap-2 transition-colors active:scale-95"
            >
              <PlayCircle size={20} /> Start Process
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
                  className="w-full bg-green-50 border-2 border-green-200 py-3 px-4 rounded-lg font-bold text-xl outline-none vivid-focus-green transition-all"
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
                  className="w-full bg-yellow-50/50 border-2 border-yellow-200 py-3 px-4 rounded-lg font-bold text-xl outline-none vivid-focus-yellow transition-all"
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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-purple-700 mb-1 uppercase">
                  Final Pieces {reqPieces ? "" : "(Optional)"}
                </label>
                <input
                  type="number"
                  step="1"
                  required={reqPieces}
                  className="w-full bg-purple-50 border-2 border-purple-200 py-3 px-4 rounded-lg font-bold text-xl outline-none vivid-focus-purple transition-all"
                  value={completeForm.return_pieces}
                  onChange={(e) =>
                    setCompleteForm({
                      ...completeForm,
                      return_pieces: e.target.value,
                    })
                  }
                  placeholder={reqPieces ? "0" : "0 (Optional)"}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1 uppercase">
                  Description / Notes (Optional)
                </label>
                <textarea
                  className="w-full bg-gray-50 border-2 border-blue-200 py-3 px-4 rounded-lg outline-none vivid-focus-blue min-h-20 transition-all font-medium"
                  value={completeForm.description}
                  onChange={(e) =>
                    setCompleteForm({
                      ...completeForm,
                      description: e.target.value,
                    })
                  }
                  placeholder="Add completion notes or issues..."
                />
              </div>
            </div>
            <div className="bg-gray-800 text-gray-200 p-4 rounded-xl font-mono shadow-inner mt-4">
              <div className="flex justify-between text-sm mb-1">
                <span>Issued ({completeForm?.weight_unit || "g"}):</span>
                <span>
                  {parseFloat(
                    (
                      issVal / (completeForm?.weight_unit === "kg" ? 1000 : 1)
                    ).toFixed(10),
                  )}
                </span>
              </div>
              <div className="flex justify-between text-sm mb-1 text-green-400">
                <span>- Return:</span>
                <span>
                  {parseFloat(
                    (
                      retVal / (completeForm?.weight_unit === "kg" ? 1000 : 1)
                    ).toFixed(10),
                  )}
                </span>
              </div>
              <div className="flex justify-between text-sm mb-3 text-yellow-400">
                <span>- Scrap:</span>
                <span>
                  {parseFloat(
                    (
                      scrVal / (completeForm?.weight_unit === "kg" ? 1000 : 1)
                    ).toFixed(10),
                  )}
                </span>
              </div>
              <div className="border-t border-gray-600 pt-3 flex justify-between font-bold">
                <span>{isLossNegative ? "Gain:" : "Loss:"}</span>
                <span
                  className={isLossNegative ? "text-green-400" : "text-white"}
                >
                  {isLossNegative ? "+" : ""}
                  {parseFloat(
                    (
                      Math.abs(liveLoss) /
                      (completeForm?.weight_unit === "kg" ? 1000 : 1)
                    ).toFixed(10),
                  )}
                </span>
              </div>
            </div>
            <button
              type="submit"
              className="w-full mt-4 bg-blue-600 text-white font-bold py-3.5 rounded-xl hover:bg-blue-700"
            >
              Complete Process
            </button>
          </form>
        </Modal>

        <Modal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          title={`Edit Job: ${selectedProcess?.job_number} (${selectedProcess?.stage})`}
          maxWidth="max-w-2xl"
        >
          <form
            onSubmit={handleEditProcess}
            className={`space-y-4 ${isShaking ? "animate-shake" : ""}`}
          >
            <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200 mb-4 flex gap-3 items-start">
              <div className="text-yellow-600 mt-0.5">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div>
                <p className="text-xs text-yellow-800 font-bold mb-0.5">
                  Retroactive Edit Notice
                </p>
                <p className="text-[11px] text-yellow-700 leading-tight">
                  Modifying weights perfectly re-balances pooled stock and base
                  inventory.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-1">
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  Category
                </label>
                <select
                  className="w-full bg-gray-50 border border-gray-200 py-2.5 px-3 rounded-md font-semibold text-sm outline-none focus:border-blue-500 focus:bg-white transition-colors"
                  value={editForm.category}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      category: e.target.value,
                    })
                  }
                >
                  {sizeOptions[selectedProcess?.metal_type]?.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-1">
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  New Issue Weight
                </label>
                <div className="flex bg-gray-50 border border-gray-200 rounded-md focus-within:border-blue-500 focus-within:bg-white transition-colors overflow-hidden">
                  <input
                    type="number"
                    step="0.001"
                    className="w-full bg-transparent text-gray-700 py-2.5 px-3 text-sm outline-none font-bold"
                    value={editForm.issued_weight}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        issued_weight: e.target.value,
                      })
                    }
                    required
                  />
                  <select
                    className="bg-gray-100 border-l border-gray-200 px-2 text-xs font-bold text-gray-600 outline-none"
                    value={editForm.weight_unit}
                    onChange={(e) =>
                      setEditForm({ ...editForm, weight_unit: e.target.value })
                    }
                  >
                    <option value="g">g</option>
                    <option value="kg">kg</option>
                  </select>
                </div>
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  Issue Pieces{" "}
                  <span className="text-gray-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="number"
                  className="w-full bg-gray-50 border border-gray-200 text-gray-700 py-2.5 px-3 text-sm rounded-md outline-none font-bold focus:border-blue-500 focus:bg-white transition-colors"
                  value={editForm.issue_pieces}
                  onChange={(e) =>
                    setEditForm({ ...editForm, issue_pieces: e.target.value })
                  }
                  placeholder="0"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                  Assigned Employee{" "}
                  <span className="text-gray-400 font-normal tracking-normal">
                    (Optional)
                  </span>
                </label>
                <select
                  className="w-full bg-gray-50 border border-gray-200 py-2.5 px-3 rounded-lg font-bold outline-none focus:border-blue-500 transition-colors cursor-pointer"
                  value={editForm.employee || ""}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      employee: e.target.value,
                    })
                  }
                >
                  <option value="" disabled>
                    Select Employee
                  </option>
                  {users
                    .filter((u) => u.role === "EMPLOYEE")
                    .map((u) => (
                      <option key={u.id} value={u.username}>
                        {u.username}
                      </option>
                    ))}
                </select>
              </div>

              {(selectedProcess?.status === "COMPLETED" ||
                selectedProcess?.status === "RUNNING") && (
                <div className="col-span-2 grid grid-cols-2 gap-3 pt-3 border-t border-gray-200 mt-1">
                  <div className="col-span-2">
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">
                      Completion Data
                    </p>
                  </div>

                  <div className="col-span-1">
                    <label className="flex items-center gap-1 text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                      Return Weight
                    </label>
                    <input
                      type="number"
                      step="0.001"
                      className="w-full bg-blue-50 border border-blue-200 text-blue-900 py-2.5 px-3 rounded-lg font-bold text-lg outline-none focus:bg-white focus:border-blue-500 transition-colors"
                      value={editForm.return_weight}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          return_weight: e.target.value,
                        })
                      }
                      placeholder={`0.000 ${editForm.weight_unit}`}
                    />
                  </div>

                  <div className="col-span-1">
                    <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                      Return Pieces
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      className="w-full bg-blue-50 border border-blue-200 py-2.5 px-3 rounded-lg font-bold text-lg outline-none focus:bg-white focus:border-blue-500 transition-colors"
                      value={editForm.return_pieces}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          return_pieces: e.target.value,
                        })
                      }
                      placeholder="0"
                    />
                  </div>

                  <div className="col-span-1">
                    <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                      Scrap / Dust
                    </label>
                    <input
                      type="number"
                      step="0.001"
                      className="w-full bg-gray-50 border border-gray-200 py-2.5 px-3 rounded-lg font-bold text-lg outline-none focus:bg-white focus:border-blue-500 transition-colors"
                      value={editForm.scrap_weight}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          scrap_weight: e.target.value,
                        })
                      }
                      placeholder={`0.000 ${editForm.weight_unit}`}
                    />
                  </div>

                  <div className="col-span-1">
                    <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                      Live Loss Calculation
                    </label>
                    <div
                      className={`w-full py-2.5 px-3 rounded-lg font-bold text-lg border flex items-center shadow-inner ${
                        editForm.loss_weight < 0
                          ? "bg-green-50 text-green-700 border-green-200"
                          : "bg-gray-100 text-gray-700 border-gray-200"
                      }`}
                    >
                      {editForm.loss_weight} {editForm.weight_unit}
                    </div>
                  </div>
                </div>
              )}

              <div className="col-span-2 bg-blue-50 p-4 rounded-xl border border-blue-100 mt-2">
                <label className="block text-xs font-bold text-blue-800 mb-1.5 uppercase tracking-wide">
                  Description / Notes{" "}
                  <span className="text-blue-600/70 font-normal tracking-normal">
                    (Optional)
                  </span>
                </label>
                <textarea
                  className="w-full bg-white border border-blue-200 py-2 px-3 text-sm rounded-lg outline-none focus:border-blue-500 min-h-20 transition-colors"
                  value={editForm.description}
                  onChange={(e) =>
                    setEditForm({ ...editForm, description: e.target.value })
                  }
                  placeholder="View or edit notes..."
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-blue-600 text-white font-bold py-3.5 text-sm rounded-xl hover:bg-blue-700 shadow flex items-center justify-center gap-2 active:scale-95 transition-all mt-2"
            >
              Update Process Database
            </button>
          </form>
        </Modal>

        {/* VIEW PROCESS MODAL */}
        <Modal
          isOpen={isViewModalOpen}
          onClose={() => setIsViewModalOpen(false)}
          title="Process Details"
          maxWidth="max-w-2xl"
        >
          {selectedProcess && (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b pb-4">
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">
                    Process Step | {selectedProcess.stage}
                  </p>
                  <h2 className="text-2xl font-black text-gray-800">
                    Job {selectedProcess.job_number}{" "}
                    <span className="text-gray-400 text-lg font-bold ml-2">
                      | {selectedProcess.metal_type}
                    </span>
                  </h2>
                </div>
                <div className="text-right">
                  <span
                    className={`px-4 py-1.5 rounded-full text-xs font-bold border flex justify-center items-center gap-1 ${selectedProcess.status === "PENDING" ? "bg-orange-50 text-orange-700 border-orange-200" : selectedProcess.status === "RUNNING" ? "bg-blue-50 text-blue-700 border-blue-200 animate-pulse" : "bg-green-50 text-green-700 border-green-200"}`}
                  >
                    {selectedProcess.status === "PENDING" ? (
                      <Clock size={14} />
                    ) : selectedProcess.status === "RUNNING" ? (
                      <Activity size={14} />
                    ) : (
                      <CheckCircle size={14} />
                    )}{" "}
                    {selectedProcess.status}
                  </span>
                  <p className="text-xs text-gray-500 mt-2 font-medium">
                    Updated: {new Date(selectedProcess.date).toLocaleString()}
                  </p>
                  {selectedProcess.start_time && (
                    <p className="text-xs text-gray-500 mt-1 font-medium">
                      Started:{" "}
                      {new Date(selectedProcess.start_time).toLocaleString()}
                    </p>
                  )}
                  {selectedProcess.end_time && (
                    <p className="text-xs text-gray-500 mt-1 font-medium">
                      Completed:{" "}
                      {new Date(selectedProcess.end_time).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex flex-col justify-center">
                  <p className="text-[10px] font-bold text-blue-700 uppercase tracking-widest mb-1">
                    Operator
                  </p>
                  <p className="text-xl font-black text-blue-800">
                    {selectedProcess.employee || "Unknown"}
                  </p>
                </div>
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex flex-col justify-center">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">
                    Total Issued
                  </p>
                  <p className="text-2xl font-black text-gray-800">
                    {formatWeight(
                      selectedProcess.issued_weight
                        ? selectedProcess.issued_weight
                        : selectedProcess.issue_size || 0,
                      selectedProcess.unit,
                    )}
                    {selectedProcess.issue_pieces > 0 && (
                      <span className="text-sm text-gray-400 ml-2 font-bold">
                        ({selectedProcess.issue_pieces} pcs)
                      </span>
                    )}
                  </p>
                </div>
                <div className="bg-green-50 p-4 rounded-xl border border-green-100 flex flex-col justify-center">
                  <p className="text-[10px] font-bold text-green-700 uppercase tracking-widest mb-1">
                    Return / Completed
                  </p>
                  <p className="text-2xl font-black text-green-700">
                    {selectedProcess.return_weight !== null
                      ? formatWeight(
                          selectedProcess.return_weight,
                          selectedProcess.unit,
                        )
                      : "-"}
                    {selectedProcess.return_pieces > 0 && (
                      <span className="text-sm text-green-600/60 ml-2 font-bold">
                        ({selectedProcess.return_pieces} pcs)
                      </span>
                    )}
                  </p>
                </div>
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex flex-col justify-center">
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">
                    Recoverable Scrap
                  </p>
                  <p className="text-xl font-black text-gray-700">
                    {selectedProcess.scrap_weight !== null
                      ? formatWeight(
                          selectedProcess.scrap_weight,
                          selectedProcess.unit,
                        )
                      : "-"}
                  </p>
                </div>
                <div className={`${selectedProcess.loss_weight < 0 ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'} p-4 rounded-xl border flex flex-col justify-center`}>
                  <p className={`text-[10px] font-bold ${selectedProcess.loss_weight < 0 ? 'text-green-700' : 'text-red-600'} uppercase tracking-widest mb-1`}>
                    {selectedProcess.loss_weight < 0 ? 'Gain' : 'Permanent Loss'}
                  </p>
                  <p className={`text-xl font-black ${selectedProcess.loss_weight < 0 ? 'text-green-700' : 'text-red-600'}`}>
                    {selectedProcess.loss_weight !== null
                      ? formatWeight(
                          Math.abs(selectedProcess.loss_weight),
                          selectedProcess.unit,
                        )
                      : "-"}
                  </p>
                </div>
              </div>

              {selectedProcess.description && (
                <div className="mt-4 bg-blue-50/50 border border-blue-100 p-4 rounded-xl">
                  <p className="text-[10px] font-bold text-blue-800 uppercase tracking-widest mb-2">
                    Process Operator Notes
                  </p>
                  <p className="text-gray-700 text-sm whitespace-pre-wrap leading-relaxed">
                    {selectedProcess.description}
                  </p>
                </div>
              )}
            </div>
          )}
        </Modal>

        <ConfirmModal
          isOpen={confirmModal.isOpen}
          onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
          title={confirmModal.title}
          message={confirmModal.message}
          onConfirm={confirmModal.onConfirm}
          isDestructive={confirmModal.isDestructive}
          confirmText={confirmModal.confirmText}
        />
      </div>

      {/* PRINTABLE JOB SHEET */}
      <div className="hidden print:block pt-4 bg-white text-black w-full text-left">
        <div className="text-center mb-8 border-b-2 border-gray-800 pb-4">
          <h1 className="text-4xl font-black uppercase tracking-widest mb-2">
            JewelCRM Production
          </h1>
          <h2 className="text-2xl font-bold text-gray-700">
            Job Sheet: {jobNumber}
          </h2>
          <p className="text-gray-500 font-bold mt-2">
            Printed: {new Date().toLocaleString()}
          </p>
        </div>

        {history.length > 0 && (
          <div className="mb-6 grid grid-cols-2 gap-4 text-sm font-bold border border-gray-400 p-4 rounded-lg">
            <div>Metal Type: {history[0].metal_type}</div>
            <div>Category: {history[0].category || "N/A"}</div>
            <div>
              Initial Issue Weight:{" "}
              {formatWeight(
                history[0].issued_weight || history[0].issue_size || 0,
                history[0].unit,
              )}
            </div>
            <div>Start Date: {new Date(history[0].date).toLocaleString()}</div>
          </div>
        )}

        <div className="space-y-6">
          {history.map((h, index) => (
            <div
              key={`print-${h.id}`}
              className={`border-2 border-gray-300 rounded-lg p-5 ${index > 0 ? "print:break-before-page mt-8" : ""}`}
              style={{ pageBreakInside: "avoid" }}
            >
              <div className="flex justify-between border-b border-gray-200 pb-2 mb-3">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <span className="bg-gray-800 text-white w-6 h-6 flex items-center justify-center rounded-full text-sm">
                    {index + 1}
                  </span>
                  {h.stage}{" "}
                  <span className="text-sm font-normal text-gray-500">
                    ({h.status})
                  </span>
                </h3>
                <div className="text-right text-sm">
                  <div className="font-bold">
                    Operator: {h.employee || "Unknown"}
                  </div>
                  <div className="text-gray-500">
                    {new Date(h.date).toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4 text-sm mb-4 bg-gray-50 p-3 rounded border">
                <div>
                  <div className="text-xs text-gray-500 uppercase font-bold mb-1">
                    Issue Weight
                  </div>
                  <div className="font-black text-lg">
                    {formatWeight(h.issued_weight || h.issue_size || 0, h.unit)}
                    {h.issue_pieces > 0 && (
                      <span className="text-xs font-normal ml-1">
                        ({h.issue_pieces} pcs)
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 uppercase font-bold mb-1">
                    Return / Good Output
                  </div>
                  <div className="font-black text-lg text-green-700">
                    {h.return_weight !== null
                      ? formatWeight(h.return_weight, h.unit)
                      : "-"}
                    {h.return_pieces > 0 && (
                      <span className="text-xs font-normal ml-1">
                        ({h.return_pieces} pcs)
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 uppercase font-bold mb-1">
                    Scrap / Dust
                  </div>
                  <div className="font-black text-lg text-gray-700">
                    {h.scrap_weight !== null
                      ? formatWeight(h.scrap_weight, h.unit)
                      : "-"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 uppercase font-bold mb-1">
                    {h.loss_weight !== null && h.loss_weight < 0
                      ? "Gain"
                      : "Loss"}
                  </div>
                  <div
                    className={`font-black text-lg ${h.loss_weight !== null && h.loss_weight < 0 ? "text-green-700" : "text-red-600"}`}
                  >
                    {h.loss_weight !== null
                      ? (h.loss_weight < 0 ? "+" : "") +
                        formatWeight(Math.abs(h.loss_weight), h.unit)
                      : "-"}
                  </div>
                </div>
              </div>

              {h.description && (
                <div className="bg-yellow-50/50 p-3 rounded border border-yellow-200 mt-2">
                  <div className="text-xs text-yellow-800 uppercase font-bold mb-1">
                    Notes / Description
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {h.description}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
        {history.length === 0 && (
          <div className="text-center text-gray-500 py-10 font-bold">
            No Records Found for {jobNumber}
          </div>
        )}

        {/* FINAL SUMMARY */}
        {history.length > 0 &&
          (() => {
            const completed = history.filter((h) => h.status === "COMPLETED");
            const lastCompleted =
              completed.length > 0 ? completed[completed.length - 1] : null;
            const totalIssue = history.reduce(
              (sum, h) =>
                sum + (parseFloat(h.issued_weight || h.issue_size) || 0),
              0,
            );
            const totalReturn = completed.reduce(
              (sum, h) => sum + (parseFloat(h.return_weight) || 0),
              0,
            );
            const totalScrap = completed.reduce(
              (sum, h) => sum + (parseFloat(h.scrap_weight) || 0),
              0,
            );
            const totalLoss = completed.reduce(
              (sum, h) => sum + (parseFloat(h.loss_weight) || 0),
              0,
            );
            const totalGain = totalLoss < 0 ? Math.abs(totalLoss) : 0;
            const totalActualLoss = totalLoss > 0 ? totalLoss : 0;
            const unit = history[0].unit;
            return (
              <div
                className="print:break-before-page mt-8 border-2 border-gray-800 rounded-lg p-6"
                style={{ pageBreakInside: "avoid" }}
              >
                <h3 className="text-2xl font-black uppercase tracking-wider mb-4 border-b-2 border-gray-800 pb-3 text-center">
                  Final Job Summary
                </h3>
                <div className="grid grid-cols-2 gap-6 text-sm mb-6">
                  <div>
                    <div className="text-xs text-gray-500 uppercase font-bold mb-1">
                      Job Number
                    </div>
                    <div className="font-black text-xl">{jobNumber}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 uppercase font-bold mb-1">
                      Metal Type / Category
                    </div>
                    <div className="font-black text-xl">
                      {history[0].metal_type} — {history[0].category || "N/A"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 uppercase font-bold mb-1">
                      Total Stages Completed
                    </div>
                    <div className="font-black text-xl">
                      {completed.length} / {history.length}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 uppercase font-bold mb-1">
                      Last Completed Stage
                    </div>
                    <div className="font-black text-xl">
                      {lastCompleted ? lastCompleted.stage : "N/A"}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-5 gap-4 bg-gray-100 p-4 rounded-lg border border-gray-300 mb-6">
                  <div className="text-center">
                    <div className="text-xs text-gray-500 uppercase font-bold mb-1">
                      First Issue
                    </div>
                    <div className="font-black text-lg">
                      {formatWeight(
                        parseFloat(
                          history[0].issued_weight || history[0].issue_size,
                        ) || 0,
                        unit,
                      )}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-500 uppercase font-bold mb-1">
                      Final Output
                    </div>
                    <div className="font-black text-lg text-green-700">
                      {lastCompleted
                        ? formatWeight(lastCompleted.return_weight, unit)
                        : "-"}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-500 uppercase font-bold mb-1">
                      Total Scrap
                    </div>
                    <div className="font-black text-lg">
                      {formatWeight(totalScrap, unit)}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-500 uppercase font-bold mb-1">
                      Net Loss
                    </div>
                    <div className="font-black text-lg text-red-600">
                      {formatWeight(totalActualLoss, unit)}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-500 uppercase font-bold mb-1">
                      Net Gain
                    </div>
                    <div className="font-black text-lg text-green-700">
                      {totalGain > 0
                        ? "+" + formatWeight(totalGain, unit)
                        : "-"}
                    </div>
                  </div>
                </div>

                {lastCompleted && (
                  <div className="bg-blue-50 border border-blue-300 p-4 rounded-lg">
                    <h4 className="text-sm font-black uppercase tracking-wider mb-3 text-blue-800">
                      Final Delivery Details
                    </h4>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <div className="text-xs text-gray-500 uppercase font-bold mb-1">
                          Final Weight
                        </div>
                        <div className="font-black text-lg">
                          {formatWeight(lastCompleted.return_weight, unit)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 uppercase font-bold mb-1">
                          Final Pieces
                        </div>
                        <div className="font-black text-lg">
                          {lastCompleted.return_pieces || 0} pcs
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 uppercase font-bold mb-1">
                          Completed On
                        </div>
                        <div className="font-bold text-sm">
                          {lastCompleted.end_time
                            ? new Date(lastCompleted.end_time).toLocaleString()
                            : new Date(lastCompleted.date).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-8 pt-6 border-t-2 border-gray-300 grid grid-cols-2 gap-8">
                  <div className="text-center">
                    <div className="border-t border-gray-400 pt-2 mt-10 text-sm font-bold text-gray-500">
                      Authorized Signature
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="border-t border-gray-400 pt-2 mt-10 text-sm font-bold text-gray-500">
                      Received By
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
      </div>
    </div>
  );
};

export default JobHistory;
