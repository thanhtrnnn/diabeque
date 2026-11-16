"use client";

import { useMemo, useState } from "react";
import {
  BookOpenTextIcon,
  CaretDownIcon,
  CheckCircleIcon,
  MagnifyingGlassIcon,
  ShuffleIcon,
  XIcon,
} from "@phosphor-icons/react/dist/ssr";

import { EXAM_GROUPS, EXAM_QUESTIONS, type ExamQuestion } from "@/components/product/exam-questions";

import styles from "./exam-prep.module.css";

function questionSearchText(question: ExamQuestion) {
  return [
    question.title,
    question.prompt,
    ...question.paragraphs,
    ...(question.points ?? []),
    question.formula ?? "",
    question.code ?? "",
    question.table?.headers.join(" ") ?? "",
    ...(question.table?.rows.flat() ?? []),
    ...(question.sources ?? []),
  ].join(" ").toLocaleLowerCase("vi");
}

function wrapSvgLabel(label: string, limit = 16) {
  const words = label.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? line + " " + word : word;
    if (candidate.length > limit && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function QuestionDiagram({ id, nodes, caption }: { id: number; nodes: string[]; caption: string }) {
  const boxWidth = 146;
  const boxHeight = 60;
  const gap = 28;
  const width = 20 + nodes.length * boxWidth + Math.max(0, nodes.length - 1) * gap;

  return (
    <figure className={styles.diagram}>
      <div className={styles.diagramScroll}>
        <svg className={styles.diagramSvg} role="img" aria-label={caption} viewBox={"0 0 " + width + " 100"} width={width} height={100}>
          <defs>
            <marker id={"exam-arrow-" + id} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
              <path className={styles.svgArrowHead} d="M0,0 L8,4 L0,8 z" />
            </marker>
          </defs>
          {nodes.map((node, index) => {
            const x = 10 + index * (boxWidth + gap);
            const lines = wrapSvgLabel(node);
            const firstLineY = 50 - ((lines.length - 1) * 9);
            return (
              <g key={node + "-" + index}>
                {index < nodes.length - 1 && (
                  <line
                    className={styles.svgArrow}
                    x1={x + boxWidth + 2}
                    y1={50}
                    x2={x + boxWidth + gap - 4}
                    y2={50}
                    markerEnd={"url(#exam-arrow-" + id + ")"}
                  />
                )}
                <rect className={styles.svgNode} x={x} y={20} width={boxWidth} height={boxHeight} rx="5" />
                <text className={styles.svgText} textAnchor="middle">
                  {lines.map((line, lineIndex) => (
                    <tspan key={lineIndex} x={x + boxWidth / 2} y={firstLineY + lineIndex * 18}>{line}</tspan>
                  ))}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className={styles.diagramNodes} aria-hidden="true">
        {nodes.map((node, index) => (
          <span className={styles.diagramNodeWrap} key={node + "-" + index}>
            <span className={styles.diagramNode}>{node}</span>
            {index < nodes.length - 1 && <span className={styles.diagramArrow}>→</span>}
          </span>
        ))}
      </div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

export function ExamPrep() {
  const [query, setQuery] = useState("");
  const [activeGroup, setActiveGroup] = useState("all");
  const [openIds, setOpenIds] = useState<Set<number>>(() => new Set());
  const [reviewedIds, setReviewedIds] = useState<Set<number>>(() => new Set());
  const [focusId, setFocusId] = useState<number | null>(null);

  const filteredQuestions = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("vi");
    return EXAM_QUESTIONS.filter((question) =>
      (activeGroup === "all" || question.group === activeGroup)
      && (!term || questionSearchText(question).includes(term)),
    );
  }, [activeGroup, query]);

  const groupedQuestions = useMemo(() => EXAM_GROUPS
    .map((group) => ({
      ...group,
      questions: filteredQuestions.filter((question) => question.group === group.id),
    }))
    .filter((group) => group.questions.length > 0), [filteredQuestions]);

  function toggleOpen(id: number) {
    setOpenIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setReviewed(id: number) {
    setReviewedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openVisible() {
    setOpenIds((previous) => new Set([...previous, ...filteredQuestions.map((question) => question.id)]));
  }

  function closeVisible() {
    const visible = new Set(filteredQuestions.map((question) => question.id));
    setOpenIds((previous) => new Set([...previous].filter((id) => !visible.has(id))));
  }

  function jumpToRandom() {
    if (filteredQuestions.length === 0) return;
    const pick = filteredQuestions[Math.floor(Math.random() * filteredQuestions.length)];
    setFocusId(pick.id);
    setOpenIds((previous) => new Set(previous).add(pick.id));
    window.setTimeout(() => document.getElementById("question-" + pick.id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  const reviewedCount = reviewedIds.size;
  const progress = Math.round((reviewedCount / EXAM_QUESTIONS.length) * 100);

  return (
    <div className={styles.study}>
      <section className={styles.overview} aria-label="Tóm tắt bộ câu hỏi">
        <div className={styles.overviewLead}>
          <span className={styles.overviewIcon}><BookOpenTextIcon weight="duotone" aria-hidden="true" /></span>
          <div>
            <p className={styles.eyebrow}>SỔ TAY VẤN ĐÁP · INTELLIGENT SYSTEM DEVELOPMENT</p>
            <h2>Ôn theo chủ đề, luyện trả lời theo ý</h2>
            <p>Đáp án ngắn gọn bằng tiếng Việt, kèm công thức, sơ đồ và ví dụ từ code Diabeque để bạn có thể giải thích bằng lời của mình.</p>
          </div>
        </div>
        <div className={styles.fact}>
          <span className={styles.factNumber}>51</span>
          <span>câu trong PDF</span>
          <span className={styles.factNote}>Tên file ghi “50”, nội dung đánh số đến 51.</span>
        </div>
      </section>

      <section className={styles.projectCallout} aria-label="Lưu ý về phần đồ án">
        <strong>Phân biệt thiết kế và phần đã làm</strong>
        <p>Architecture PDF mô tả hệ hybrid mở rộng (Rule, Monitoring và RL là các vai trò riêng). Code hiện tại có 7 node LangGraph; trang này ghi rõ khi một ý thuộc đề xuất để tránh trình bày nhầm là tính năng đã triển khai.</p>
        <a href="/app/kien-truc">Mở sơ đồ kiến trúc hiện tại <span aria-hidden="true">↗</span></a>
      </section>

      <section className={styles.controls} aria-label="Tìm và lọc câu hỏi">
        <div className={styles.search} role="search">
          <MagnifyingGlassIcon weight="bold" aria-hidden="true" />
          <label className={styles.visuallyHidden} htmlFor="exam-search">Tìm trong câu hỏi và đáp án</label>
          <input
            id="exam-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm thuật ngữ, chủ đề hoặc số liệu..."
          />
          {query && <button type="button" onClick={() => setQuery("")} aria-label="Xóa nội dung tìm kiếm"><XIcon aria-hidden="true" /></button>}
        </div>

        <div className={styles.filters} role="group" aria-label="Lọc theo phần">
          <button type="button" aria-pressed={activeGroup === "all"} onClick={() => setActiveGroup("all")}>Tất cả <span>{EXAM_QUESTIONS.length}</span></button>
          {EXAM_GROUPS.map((group) => (
            <button key={group.id} type="button" aria-pressed={activeGroup === group.id} onClick={() => setActiveGroup(group.id)}>
              {group.short} <span>{group.to - group.from + 1}</span>
            </button>
          ))}
        </div>

        <div className={styles.studyActions}>
          <button type="button" className={styles.secondaryAction} onClick={jumpToRandom} disabled={filteredQuestions.length === 0}>
            <ShuffleIcon aria-hidden="true" /> Câu ngẫu nhiên
          </button>
          <button type="button" className={styles.secondaryAction} onClick={openVisible} disabled={filteredQuestions.length === 0}>Mở đáp án</button>
          <button type="button" className={styles.secondaryAction} onClick={closeVisible} disabled={filteredQuestions.length === 0}>Thu gọn</button>
        </div>
      </section>

      <div className={styles.progressRow}>
        <p role="status" aria-live="polite">
          <strong>{filteredQuestions.length}</strong> câu phù hợp
          {query && <> với “{query}”</>}
          <span className={styles.separator}>·</span>
          <strong>{reviewedCount}/{EXAM_QUESTIONS.length}</strong> câu đã ôn
        </p>
        <div className={styles.progressTrack} role="progressbar" aria-label="Tiến độ ôn tập" aria-valuemin={0} aria-valuemax={EXAM_QUESTIONS.length} aria-valuenow={reviewedCount}>
          <span style={{ width: String(progress) + "%" }} />
        </div>
      </div>

      {groupedQuestions.length === 0 ? (
        <div className={styles.empty} role="status">
          <strong>Chưa tìm thấy câu phù hợp</strong>
          <p>Thử từ khóa khác hoặc xóa bộ lọc để xem lại cả bộ câu hỏi.</p>
          <button type="button" onClick={() => { setQuery(""); setActiveGroup("all"); }}>Xóa bộ lọc</button>
        </div>
      ) : (
        <div className={styles.questionGroups}>
          {groupedQuestions.map((group) => (
            <section className={styles.group} key={group.id} aria-labelledby={"group-" + group.id}>
              <header className={styles.groupHeading}>
                <div>
                  <p className={styles.eyebrow}>PHẦN {EXAM_GROUPS.findIndex((item) => item.id === group.id) + 1}</p>
                  <h2 id={"group-" + group.id}>{group.label}</h2>
                </div>
                <span>{group.questions.length} câu</span>
              </header>
              <div className={styles.questionList}>
                {group.questions.map((question) => (
                  <article
                    className={styles.question}
                    id={"question-" + question.id}
                    key={question.id}
                    data-open={openIds.has(question.id)}
                    data-focus={focusId === question.id}
                  >
                    <div className={styles.questionHead}>
                      <button
                        className={styles.questionToggle}
                        type="button"
                        aria-expanded={openIds.has(question.id)}
                        aria-controls={"answer-" + question.id}
                        onClick={() => toggleOpen(question.id)}
                      >
                        <span className={styles.questionNumber}>{String(question.id).padStart(2, "0")}</span>
                        <span className={styles.questionCopy}>
                          <span className={styles.questionMeta}>CÂU {question.id} <span aria-hidden="true">·</span> {group.short}</span>
                          <span className={styles.questionTitle}>{question.title}</span>
                          <span className={styles.prompt}>{question.prompt}</span>
                        </span>
                        <CaretDownIcon className={styles.chevron} aria-hidden="true" />
                      </button>
                      <button
                        className={styles.reviewButton}
                        type="button"
                        aria-pressed={reviewedIds.has(question.id)}
                        onClick={() => setReviewed(question.id)}
                        title={reviewedIds.has(question.id) ? "Bỏ đánh dấu đã ôn" : "Đánh dấu đã ôn"}
                      >
                        <CheckCircleIcon weight={reviewedIds.has(question.id) ? "fill" : "regular"} aria-hidden="true" />
                        <span>{reviewedIds.has(question.id) ? "Đã ôn" : "Đánh dấu"}</span>
                      </button>
                    </div>
                    <div className={styles.answer} id={"answer-" + question.id} hidden={!openIds.has(question.id)}>
                        <div className={styles.answerLabel}><span />GỢI Ý TRẢ LỜI</div>
                        {question.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
                        {question.formula && <div className={styles.formula}><span>Công thức / ký hiệu</span><code>{question.formula}</code></div>}
                        {question.points && <ul className={styles.points}>{question.points.map((point) => <li key={point}>{point}</li>)}</ul>}
                        {question.diagram && <QuestionDiagram id={question.id} nodes={question.diagram.nodes} caption={question.diagram.caption} />}
                        {question.table && (
                          <div className={styles.tableWrap}>
                            {question.table.caption && <p className={styles.tableCaption}>{question.table.caption}</p>}
                            <table>
                              <thead><tr>{question.table.headers.map((header) => <th scope="col" key={header}>{header}</th>)}</tr></thead>
                              <tbody>{question.table.rows.map((row, rowIndex) => (
                                <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>
                              ))}</tbody>
                            </table>
                          </div>
                        )}
                        {question.code && <pre className={styles.code}><code>{question.code}</code></pre>}
                        {question.projectNote && <p className={styles.projectNote}><strong>Ghi chú khi bảo vệ:</strong> {question.projectNote}</p>}
                        {question.sources && (
                          <div className={styles.sources}>
                            <span>Đối chiếu dự án</span>
                            {question.sources.map((source) => <code key={source}>{source}</code>)}
                          </div>
                        )}
                        <p className={styles.speakingTip}><strong>Mẹo vấn đáp:</strong> Nêu khái niệm trước, giải thích một quyết định cụ thể, rồi chỉ ra giới hạn hoặc ví dụ.</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      <footer className={styles.footer}>
        <p>Hãy dùng các gợi ý để luyện giải thích bằng lời của mình. Số liệu dự án là kết quả thực nghiệm trên bộ dữ liệu khảo sát, không phải bằng chứng chẩn đoán lâm sàng.</p>
      </footer>
    </div>
  );
}
