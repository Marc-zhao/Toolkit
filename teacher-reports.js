/* VocaQuest teacher reports: deterministic analytics, versioned cache, and branded PDF printing. */
const teacherReportState = { classes: [], students: [], lastReport: null, lastElement: null };

function reportDate(value) {
  const date = value ? new Date(`${value}T00:00:00`) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function reportISO(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function reportHash(value) {
  let hash = 2166136261;
  for (const char of String(value || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function reportChapterCount(wordCount) {
  return Math.max(1, Math.ceil((Number(wordCount) || 0) / 10));
}

function reportWords(pack) {
  return (Array.isArray(pack?.words) ? pack.words : []).map(item =>
    typeof item === 'string' ? { w: item, m: '' } : { w: item?.w || item?.word || '', m: item?.m || item?.meaning || '' }
  ).filter(item => item.w);
}

function reportPercent(value) {
  return `${Math.round(Number(value) || 0)}%`;
}

function reportRangeDefaults() {
  const end = new Date();
  const start = new Date(end);
  const day = (end.getDay() + 6) % 7;
  start.setDate(end.getDate() - day);
  return { start: reportISO(start), end: reportISO(end) };
}

async function reportFetchPaged(table, columns, configure, orderColumn = 'created_at') {
  const rows = [];
  const pageSize = 1000;
  for (let page = 0; page < 100; page++) {
    let query = db.from(table).select(columns);
    query = configure(query).order(orderColumn, { ascending: true }).range(page * pageSize, (page + 1) * pageSize - 1);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function renderTeacherReports(cont) {
  const defaults = reportRangeDefaults();
  const { data: classes, error } = await db.from('classes').select('id,name').eq('teacher_id', G.userId).order('name');
  if (error) {
    cont.innerHTML = '<div style="color:var(--red);padding:18px">无法读取班级，请刷新后重试。</div>';
    return;
  }
  teacherReportState.classes = classes || [];
  cont.innerHTML = `<div class="report-builder">
    <div class="report-intro"><div><strong>VocaQuest 教学报告中心</strong><span>合并词汇闯关与句子填空数据，直接回答完成率、共同难词、未完成学生、掌握率变化和词包难度。相同数据不会重复生成。</span></div><span>本功能不调用 AI，不产生智谱费用。</span></div>
    <div class="report-filter-grid">
      <label>报告类型<select id="report-type" onchange="updateReportStudentFilter()">
        <option value="comprehensive">综合教学诊断</option><option value="weekly_class">班级周报</option><option value="semester_compare">学期对比</option><option value="difficulty">词汇难度分布</option><option value="top_errors">高频错词 Top 20</option><option value="student_profile">学生个人档案</option>
      </select></label>
      <label>班级<select id="report-class" onchange="loadReportStudents()"><option value="">全部班级</option>${teacherReportState.classes.map(item => `<option value="${escH(item.id)}">${escH(item.name)}</option>`).join('')}</select></label>
      <label>数据工具<select id="report-tool"><option value="combined">两个工具合并</option><option value="vocabulary">单词闯关</option><option value="fillblank">句子填空</option></select></label>
      <label>开始日期<input class="inp" id="report-start" type="date" value="${defaults.start}"></label>
      <label>结束日期<input class="inp" id="report-end" type="date" value="${defaults.end}"></label>
    </div>
    <div id="report-student-wrap" style="display:none"><label>学生<select id="report-student"><option value="">请先选择班级</option></select></label></div>
    <div class="report-actions"><button class="btn btn-sm btn-cyan" id="report-generate" onclick="generateTeacherReport()">生成 / 调取报告</button><button class="btn btn-sm btn-gray" onclick="loadTeacherReportCache()">查看已生成报告</button></div>
    <div class="report-status" id="report-status"></div>
    <div id="report-output"></div>
    <div id="report-cache"></div>
  </div>`;
}

function updateReportStudentFilter() {
  const personal = document.getElementById('report-type')?.value === 'student_profile';
  document.getElementById('report-student-wrap').style.display = personal ? 'block' : 'none';
  if (personal) loadReportStudents();
}

async function loadReportStudents() {
  const classId = document.getElementById('report-class')?.value;
  const select = document.getElementById('report-student');
  if (!select) return;
  if (!classId) {
    select.innerHTML = '<option value="">请先选择班级</option>';
    return;
  }
  const { data } = await db.from('profiles').select('id,full_name').eq('class_id', classId).eq('is_teacher', false).order('full_name');
  teacherReportState.students = data || [];
  select.innerHTML = '<option value="">请选择学生</option>' + teacherReportState.students.map(item => `<option value="${escH(item.id)}">${escH(item.full_name || '未命名学生')}</option>`).join('');
}

function reportFilterValues() {
  return {
    type: document.getElementById('report-type')?.value || 'comprehensive',
    classId: document.getElementById('report-class')?.value || '',
    tool: document.getElementById('report-tool')?.value || 'combined',
    start: document.getElementById('report-start')?.value || reportRangeDefaults().start,
    end: document.getElementById('report-end')?.value || reportRangeDefaults().end,
    studentId: document.getElementById('report-student')?.value || ''
  };
}

async function fetchTeacherReportData(filter) {
  let classQuery = db.from('classes').select('id,name').eq('teacher_id', G.userId);
  if (filter.classId) classQuery = classQuery.eq('id', filter.classId);
  const { data: classes, error: classError } = await classQuery;
  if (classError) throw classError;
  const classIds = (classes || []).map(item => item.id);
  if (!classIds.length) return { classes: [], students: [], assignments: [], packs: [], progress: [], records: [], stages: [] };

  const [allStudents, allAssignments] = await Promise.all([
    reportFetchPaged('profiles', 'id,full_name,class_id,created_at', query => query.eq('is_teacher', false).in('class_id', classIds)),
    reportFetchPaged('class_assignments', 'class_id,pack_id,created_at', query => query.in('class_id', classIds))
  ]);
  let students = allStudents;
  if (filter.studentId) students = students.filter(item => item.id === filter.studentId);
  const studentIds = students.map(item => item.id);
  const packIds = [...new Set(allAssignments.map(item => item.pack_id))];
  const packResult = packIds.length
    ? await db.from('word_packs').select('id,name,words,updated_at').in('id', packIds)
    : { data: [], error: null };
  if (packResult.error) throw packResult.error;
  if (!studentIds.length) return { classes: classes || [], students, assignments: allAssignments, packs: packResult.data || [], progress: [], records: [], stages: [] };

  const startDate = reportDate(filter.start);
  const endDate = reportDate(filter.end);
  const rangeDays = Math.max(1, Math.round((endDate - startDate) / 86400000) + 1);
  const compareStart = new Date(startDate);
  compareStart.setDate(compareStart.getDate() - rangeDays);
  const startStamp = `${reportISO(compareStart)}T00:00:00.000Z`;
  const endStamp = `${filter.end}T23:59:59.999Z`;
  const [progress, records, stages] = await Promise.all([
    reportFetchPaged('student_progress', 'user_id,pack_id,prog_data,updated_at,created_at', query => query.in('user_id', studentIds)),
    reportFetchPaged('fillblank_records', 'user_id,pack_id,stage_num,is_correct,word,meaning,created_at', query => query.in('user_id', studentIds).gte('created_at', startStamp).lte('created_at', endStamp)),
    reportFetchPaged('fillblank_stage_results', 'user_id,pack_id,stage_num,created_at', query => query.in('user_id', studentIds))
  ]);
  return {
    classes: classes || [], students, assignments: allAssignments, packs: packResult.data || [],
    progress, records, stages
  };
}

function reportInRange(value, start, end) {
  const time = new Date(value).getTime();
  return time >= new Date(`${start}T00:00:00`).getTime() && time <= new Date(`${end}T23:59:59`).getTime();
}

function analyzeTeacherReport(raw, filter) {
  const classMap = Object.fromEntries(raw.classes.map(item => [item.id, item]));
  const studentMap = Object.fromEntries(raw.students.map(item => [item.id, item]));
  const packMap = Object.fromEntries(raw.packs.map(item => [item.id, item]));
  const assigned = {};
  raw.assignments.forEach(item => {
    assigned[item.class_id] ||= [];
    assigned[item.class_id].push(item.pack_id);
  });
  const progressMap = {};
  raw.progress.forEach(item => { progressMap[`${item.user_id}:${item.pack_id}`] = item; });
  const currentRecords = raw.records.filter(item => reportInRange(item.created_at, filter.start, filter.end));
  const currentStages = raw.stages.filter(item => reportInRange(item.created_at, filter.start, filter.end));
  const startDate = reportDate(filter.start);
  const endDate = reportDate(filter.end);
  const days = Math.max(1, Math.round((endDate - startDate) / 86400000) + 1);
  const previousEnd = new Date(startDate); previousEnd.setDate(previousEnd.getDate() - 1);
  const previousStart = new Date(previousEnd); previousStart.setDate(previousStart.getDate() - days + 1);
  const previousRecords = raw.records.filter(item => reportInRange(item.created_at, reportISO(previousStart), reportISO(previousEnd)));

  const completedStageSets = {};
  raw.stages.forEach(row => {
    const key = `${row.user_id}:${row.pack_id}`;
    completedStageSets[key] ||= new Set();
    if (Number(row.stage_num) > 0) completedStageSets[key].add(Number(row.stage_num));
  });
  const studentMetrics = raw.students.map(student => {
    const packIds = assigned[student.class_id] || [];
    const taskScores = [];
    const packScores = {};
    let latest = new Date(student.created_at || 0).getTime();
    packIds.forEach(packId => {
      const pack = packMap[packId];
      const words = reportWords(pack);
      const progress = progressMap[`${student.id}:${packId}`];
      const chapterTotal = reportChapterCount(words.length);
      const chapterDone = Object.keys(progress?.prog_data?.mapState?.completed || {}).filter(key => /^chapter-\d+/.test(key)).length
        || new Set(progress?.prog_data?.cleared || []).size;
      const vqScore = Math.min(100, chapterDone / Math.max(1, chapterTotal) * 100);
      const fillTotal = Math.max(1, Math.ceil(words.length / 5));
      const fillDone = completedStageSets[`${student.id}:${packId}`]?.size || 0;
      const fillScore = Math.min(100, fillDone / fillTotal * 100);
      const score = filter.tool === 'vocabulary' ? vqScore : filter.tool === 'fillblank' ? fillScore : (vqScore + fillScore) / 2;
      taskScores.push(score);
      packScores[packId] = score;
      latest = Math.max(latest, new Date(progress?.updated_at || 0).getTime());
    });
    raw.records.filter(row => row.user_id === student.id).forEach(row => { latest = Math.max(latest, new Date(row.created_at).getTime()); });
    raw.stages.filter(row => row.user_id === student.id).forEach(row => { latest = Math.max(latest, new Date(row.created_at).getTime()); });
    return {
      id: student.id, name: student.full_name || '未命名学生', classId: student.class_id,
      completion: taskScores.length ? taskScores.reduce((sum, value) => sum + value, 0) / taskScores.length : 0,
      assignedTasks: packIds.length, packScores, lastActivity: latest ? new Date(latest).toISOString() : '',
      inactiveDays: latest ? Math.max(0, Math.floor((Date.now() - latest) / 86400000)) : 999
    };
  });
  const classMetrics = raw.classes.map(cls => {
    const members = studentMetrics.filter(item => item.classId === cls.id);
    return {
      id: cls.id, name: cls.name, students: members.length,
      completion: members.length ? members.reduce((sum, item) => sum + item.completion, 0) / members.length : 0
    };
  }).sort((a, b) => a.completion - b.completion);

  const wordStats = {};
  const addWord = (word, meaning, studentId, wrong = 1, attempts = 1, source = 'fillblank') => {
    const normalized = String(word || '').trim().toLowerCase();
    if (!normalized) return;
    wordStats[normalized] ||= { word: String(word).trim(), meaning: meaning || '', wrong: 0, attempts: 0, students: new Set(), sources: new Set() };
    wordStats[normalized].wrong += wrong;
    wordStats[normalized].attempts += attempts;
    if (studentId) wordStats[normalized].students.add(studentId);
    wordStats[normalized].sources.add(source);
  };
  if (filter.tool !== 'vocabulary') currentRecords.forEach(row => addWord(row.word, row.meaning, row.user_id, row.is_correct ? 0 : 1, 1));
  if (filter.tool !== 'fillblank') raw.progress.forEach(row => {
    const weak = [...(row.prog_data?.wrongWords || []), ...(row.prog_data?.unfamiliar || [])];
    weak.forEach(item => addWord(typeof item === 'string' ? item : item?.w, typeof item === 'string' ? '' : item?.m, row.user_id, 1, 1, 'vocabulary'));
  });
  const hardWords = Object.values(wordStats).map(item => ({
    word: item.word, meaning: item.meaning, wrong: item.wrong, attempts: item.attempts,
    studentIds: [...item.students], sources: [...item.sources], studentCount: item.students.size,
    errorRate: item.attempts ? item.wrong / item.attempts * 100 : 0,
    score: item.wrong * 3 + item.students.size * 5 + (item.attempts ? item.wrong / item.attempts * 10 : 0)
  })).sort((a, b) => b.score - a.score);

  const accuracy = rows => {
    if (!rows.length) return 0;
    return rows.filter(row => row.is_correct).length / rows.length * 100;
  };
  const currentAccuracy = accuracy(currentRecords);
  const previousAccuracy = accuracy(previousRecords);
  const masteryDelta = currentAccuracy - previousAccuracy;
  const packDifficulty = raw.packs.map(pack => {
    const packStudents = raw.students.filter(student => (assigned[student.class_id] || []).includes(pack.id));
    const completion = packStudents.length
      ? packStudents.reduce((sum, student) => sum + (studentMetrics.find(item => item.id === student.id)?.packScores?.[pack.id] || 0), 0) / packStudents.length : 0;
    const records = currentRecords.filter(row => row.pack_id === pack.id);
    const acc = accuracy(records);
    const hard = records.length ? (acc < 65 || completion < 50) : completion < 45;
    return { id: pack.id, name: pack.name, completion, accuracy: acc, attempts: records.length, hard };
  }).sort((a, b) => (a.accuracy || a.completion) - (b.accuracy || b.completion));

  const allPackWords = raw.packs.flatMap(pack => reportWords(pack));
  const difficulty = { easy: 0, medium: 0, hard: 0 };
  const seen = new Set();
  allPackWords.forEach(item => {
    const key = item.w.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const stat = wordStats[key];
    if (!stat || (!stat.wrong && stat.attempts)) difficulty.easy++;
    else if ((stat.studentCount || 0) >= 2 || (stat.errorRate || 0) >= 60) difficulty.hard++;
    else difficulty.medium++;
  });
  const persistent = studentMetrics.filter(item => item.completion < 60 && (item.inactiveDays >= 7 || item.completion < 30)).sort((a, b) => a.completion - b.completion);
  const reteach = hardWords.filter(item => item.studentCount >= 2 || item.wrong >= 3).slice(0, 12);
  const selectedStudent = filter.studentId ? studentMetrics.find(item => item.id === filter.studentId) : null;
  const selectedStudentRecords = selectedStudent ? currentRecords.filter(item => item.user_id === selectedStudent.id) : [];
  const selectedStudentHardWords = selectedStudent
    ? hardWords.filter(item => item.studentIds.includes(selectedStudent.id)).slice(0, 12)
    : [];
  return {
    generatedAt: new Date().toISOString(), filter, previousStart: reportISO(previousStart), previousEnd: reportISO(previousEnd),
    classes: classMetrics, students: studentMetrics, lowestClasses: classMetrics.slice(0, 3),
    persistent, hardWords: hardWords.slice(0, 20), reteach, packDifficulty, difficulty,
    currentAccuracy, previousAccuracy, masteryDelta, currentAttempts: currentRecords.length,
    selectedStudent, selectedStudentAccuracy: accuracy(selectedStudentRecords),
    selectedStudentAttempts: selectedStudentRecords.length, selectedStudentHardWords, classMap, studentMap
  };
}

function reportVersion(raw, filter) {
  const summary = {
    filter,
    classes: raw.classes.map(item => [item.id, item.name]),
    students: raw.students.map(item => [item.id, item.class_id, item.created_at]),
    assignments: raw.assignments.map(item => [item.class_id, item.pack_id, item.created_at]),
    packs: raw.packs.map(item => [item.id, item.updated_at, reportWords(item).length]),
    progress: raw.progress.map(item => [item.user_id, item.pack_id, item.updated_at, reportHash(JSON.stringify(item.prog_data || {}))]),
    records: raw.records.map(item => [item.user_id, item.pack_id, item.is_correct, item.word, item.created_at]),
    stages: raw.stages.map(item => [item.user_id, item.pack_id, item.stage_num, item.correct_count, item.total_count, item.created_at])
  };
  return reportHash(JSON.stringify(summary));
}

async function generateTeacherReport() {
  const button = document.getElementById('report-generate');
  const status = document.getElementById('report-status');
  const filter = reportFilterValues();
  if (filter.start > filter.end) return toast('开始日期不能晚于结束日期', 'err');
  if (filter.type === 'student_profile' && (!filter.classId || !filter.studentId)) return toast('个人档案需要选择班级和学生', 'err');
  button.disabled = true;
  status.textContent = '正在读取两个工具的学习记录…';
  try {
    const raw = await fetchTeacherReportData(filter);
    const version = reportVersion(raw, filter);
    const cacheKey = reportHash(`${filter.type}|${filter.classId}|${filter.studentId}|${filter.tool}|${filter.start}|${filter.end}|${version}`);
    const { data: cached } = await db.from('teacher_reports').select('*').eq('teacher_id', G.userId).eq('cache_key', cacheKey).maybeSingle();
    let report;
    if (cached?.report_data) {
      report = cached.report_data;
      status.textContent = `已调取相同数据的缓存报告 · ${new Date(cached.created_at).toLocaleString()}`;
    } else {
      report = analyzeTeacherReport(raw, filter);
      const { error } = await db.from('teacher_reports').insert({
        teacher_id: G.userId, cache_key: cacheKey, report_type: filter.type, tool_scope: filter.tool,
        class_id: filter.classId || null, student_id: filter.studentId || null,
        period_start: filter.start, period_end: filter.end, data_version: version, report_data: report
      });
      if (error) throw error;
      status.textContent = '新报告已生成并缓存；相同数据再次查询会直接调取。';
    }
    teacherReportState.lastReport = report;
    renderTeacherReport(report);
  } catch (error) {
    console.error('Teacher report:', error);
    status.textContent = `报告生成失败：${error.message || '请稍后重试'}`;
    toast('报告生成失败', 'err');
  } finally {
    button.disabled = false;
  }
}

function reportClassName(report, classId) {
  return report.classMap?.[classId]?.name || teacherReportState.classes.find(item => item.id === classId)?.name || '全部班级';
}

function reportTable(rows, headers, cells) {
  if (!rows.length) return '<div class="report-empty">当前筛选条件下暂无足够数据</div>';
  return `<table class="report-table"><thead><tr>${headers.map(item => `<th>${item}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${cells(row).map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function renderTeacherReport(report) {
  const output = document.getElementById('report-output');
  const classLabel = report.filter.classId ? reportClassName(report, report.filter.classId) : '所管全部班级';
  const lowest = report.lowestClasses?.[0];
  const common = report.hardWords?.[0];
  const hardPack = report.packDifficulty?.find(item => item.hard);
  const delta = Number(report.masteryDelta || 0);
  const totalWords = Object.values(report.difficulty || {}).reduce((sum, value) => sum + value, 0) || 1;
  output.innerHTML = `<article class="report-paper" id="teacher-report-paper">
    <header class="report-brand"><div><div class="report-logo">VOCAQUEST<span>VOCABULARY ADVENTURE LEARNING SYSTEM</span></div></div><div><div class="report-title">${reportTypeLabel(report.filter.type)}</div><div class="report-subtitle">${escH(classLabel)} · ${report.filter.start} 至 ${report.filter.end} · ${reportToolLabel(report.filter.tool)}</div></div></header>
    <div><span class="report-badge">生成时间 ${new Date(report.generatedAt).toLocaleString()}</span><span class="report-badge">数据已缓存</span><span class="report-badge">${report.students.length} 名学生</span></div>
    <section class="report-answer-grid">
      <div class="report-answer ${lowest?.completion < 50 ? 'danger' : 'warn'}"><strong>完成率最低班级</strong><b>${lowest ? escH(lowest.name) : '暂无数据'}</b><span>${lowest ? `${reportPercent(lowest.completion)} · ${lowest.students} 名学生` : '尚未建立班级'}</span></div>
      <div class="report-answer warn"><strong>全年级共同难点</strong><b>${common ? escH(common.word) : '暂无共同难词'}</b><span>${common ? `${common.studentCount} 名学生遇到困难 · ${common.wrong} 次错误` : '继续积累练习数据'}</span></div>
      <div class="report-answer ${report.persistent.length ? 'danger' : ''}"><strong>持续未完成任务</strong><b>${report.persistent.length} 名学生</b><span>${report.persistent.length ? '建议本周逐一跟进' : '当前没有持续未完成学生'}</span></div>
      <div class="report-answer ${delta < 0 ? 'danger' : ''}"><strong>本周掌握率变化</strong><b>${report.currentAttempts ? `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%` : '区间数据不足'}</b><span>${report.currentAttempts ? `本期 ${reportPercent(report.currentAccuracy)} · 上期 ${reportPercent(report.previousAccuracy)}` : '需要句子填空答题记录后进行区间对比'}</span></div>
      <div class="report-answer ${hardPack ? 'warn' : ''}"><strong>词包是否过难</strong><b>${hardPack ? escH(hardPack.name) : '未发现明显过难'}</b><span>${hardPack ? `完成率 ${reportPercent(hardPack.completion)} · 正确率 ${reportPercent(hardPack.accuracy)}` : '当前词包难度整体适中'}</span></div>
      <div class="report-answer ${report.reteach.length ? 'warn' : ''}"><strong>建议重新课堂教学</strong><b>${report.reteach.length} 个词</b><span>${report.reteach.slice(0, 4).map(item => escH(item.word)).join('、') || '暂无'}</span></div>
    </section>
    ${report.filter.type === 'student_profile' ? renderStudentProfileSection(report) : ''}
    <section class="report-section"><h3>班级完成率</h3>${reportTable(report.classes, ['班级', '学生数', '综合完成率', '教学建议'], row => [`<strong>${escH(row.name)}</strong>`, row.students, reportPercent(row.completion), row.completion < 50 ? '优先检查任务量与未完成人员' : row.completion < 75 ? '安排一次集中补练' : '保持当前节奏'])}</section>
    <section class="report-section"><h3>高频错词 Top 20</h3>${reportTable(report.hardWords, ['排名', '词汇', '受影响学生', '错误次数', '错误率'], (row, index) => [report.hardWords.indexOf(row) + 1, `<strong>${escH(row.word)}</strong><br>${escH(row.meaning || '')}`, row.studentCount, row.wrong, reportPercent(row.errorRate)])}</section>
    <section class="report-section"><h3>词汇难度分布</h3>
      ${[['容易', report.difficulty.easy, '#2fa36b'], ['中等', report.difficulty.medium, '#d38a14'], ['困难', report.difficulty.hard, '#c8445d']].map(([name, value, color]) => `<div class="report-bar-row"><span>${name}</span><span class="report-bar"><i style="width:${value / totalWords * 100}%;background:${color}"></i></span><strong>${value}</strong></div>`).join('')}
    </section>
    <section class="report-section"><h3>持续未完成任务的学生</h3>${reportTable(report.persistent.slice(0, 30), ['学生', '班级', '完成率', '距上次学习', '建议'], row => [`<strong>${escH(row.name)}</strong>`, escH(reportClassName(report, row.classId)), reportPercent(row.completion), row.inactiveDays > 365 ? '暂无记录' : `${row.inactiveDays} 天`, row.completion < 30 ? '教师单独跟进并缩小任务量' : '安排补做并设置本周检查点'])}</section>
    <section class="report-section"><h3>词包难度诊断</h3>${reportTable(report.packDifficulty, ['词包', '完成率', '填空正确率', '判断'], row => [`<strong>${escH(row.name)}</strong>`, reportPercent(row.completion), row.attempts ? reportPercent(row.accuracy) : '数据不足', row.hard ? '<span style="color:#b8324c">可能过难，建议拆包或复教</span>' : '难度适中'])}</section>
    <section class="report-section"><h3>建议重新进入课堂的词</h3><div>${report.reteach.length ? report.reteach.map(item => `<span class="report-badge" style="margin-bottom:6px"><strong>${escH(item.word)}</strong> · ${item.studentCount} 人 / ${item.wrong} 错</span>`).join('') : '<div class="report-empty">当前没有达到复教阈值的词</div>'}</div></section>
    ${report.filter.type === 'semester_compare' ? `<section class="report-section"><h3>学期区间对比</h3><p>当前区间正确率 <strong>${reportPercent(report.currentAccuracy)}</strong>，对比区间（${report.previousStart} 至 ${report.previousEnd}）为 <strong>${reportPercent(report.previousAccuracy)}</strong>，变化 <strong>${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%</strong>。</p></section>` : ''}
    <footer style="margin-top:24px;padding-top:10px;border-top:1px solid #d8e0e8;font-size:10px;color:#718096">VocaQuest 教学数据报告 · 统计结论来自所选班级与日期区间内的真实学习记录。记录较少时应结合课堂观察判断。</footer>
  </article>
  <div class="report-actions" style="margin-top:10px"><button class="btn btn-sm btn-gold" onclick="printTeacherReport()">导出当前报告 PDF</button><button class="btn btn-sm btn-gray" onclick="loadTeacherReportCache()">查看历史报告</button></div>`;
}

function renderStudentProfileSection(report) {
  const student = report.selectedStudent;
  if (!student) return '';
  return `<section class="report-section"><h3>学生个人学习档案</h3>
    <div class="report-answer-grid"><div class="report-answer"><strong>学生</strong><b>${escH(student.name)}</b><span>${escH(reportClassName(report, student.classId))}</span></div><div class="report-answer"><strong>综合完成率</strong><b>${reportPercent(student.completion)}</b><span>${student.assignedTasks} 个已布置词包</span></div><div class="report-answer"><strong>最近学习</strong><b>${student.inactiveDays > 365 ? '暂无' : `${student.inactiveDays} 天前`}</b><span>本期填空正确率 ${report.selectedStudentAttempts ? reportPercent(report.selectedStudentAccuracy) : '暂无记录'}</span></div></div>
    <div style="margin-top:10px"><strong>个人薄弱词：</strong>${report.selectedStudentHardWords?.length ? report.selectedStudentHardWords.map(item => `<span class="report-badge">${escH(item.word)} · ${item.wrong} 错</span>`).join('') : '当前没有达到统计阈值的薄弱词'}</div>
  </section>`;
}

function reportTypeLabel(value) {
  return ({ comprehensive: '综合教学诊断报告', weekly_class: '班级周报', semester_compare: '学期对比报告', difficulty: '词汇难度分布报告', top_errors: '高频错词 Top 20', student_profile: '学生个人学习档案' })[value] || '教学报告';
}

function reportToolLabel(value) {
  return ({ combined: '词汇闯关 + 句子填空', vocabulary: '词汇闯关', fillblank: '句子填空' })[value] || value;
}

function printTeacherReport() {
  const paper = document.getElementById('teacher-report-paper');
  if (!paper) return toast('请先生成报告', 'err');
  const popup = window.open('', '_blank');
  if (!popup) return toast('浏览器阻止了打印窗口，请允许弹窗', 'err');
  try { popup.opener = null; } catch (error) {}
  popup.document.write(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>VocaQuest 教学报告</title><style>
    @page{size:A4;margin:12mm}body{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;color:#172033;margin:0}.report-paper{line-height:1.55}.report-brand{display:flex;justify-content:space-between;border-bottom:3px solid #008caf;padding-bottom:12px;margin-bottom:16px}.report-logo{font-weight:900;color:#008caf;letter-spacing:2px}.report-logo span{display:block;font-size:8px;color:#607086;margin-top:5px}.report-title{font-size:22px;font-weight:800}.report-subtitle,.report-answer span{font-size:11px;color:#68768a}.report-badge{display:inline-block;padding:3px 7px;border:1px solid #aeb9c8;margin:3px;font-size:10px}.report-answer-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:14px 0}.report-answer{padding:9px;border-left:4px solid #008caf;background:#f3f7fa}.report-answer.warn{border-color:#db8b13}.report-answer.danger{border-color:#c8445d}.report-answer strong{display:block;font-size:10px;color:#536178}.report-answer b{display:block;font-size:15px}.report-section{break-inside:avoid;margin-top:17px}.report-section h3{font-size:14px;border-bottom:1px solid #d9e0e8;padding-bottom:5px}.report-table{width:100%;border-collapse:collapse;font-size:10px}.report-table th,.report-table td{padding:6px;border-bottom:1px solid #e2e7ed;text-align:left}.report-table th{background:#f4f7fa}.report-bar-row{display:grid;grid-template-columns:90px 1fr 40px;gap:7px;align-items:center;font-size:10px;margin:5px 0}.report-bar{height:8px;background:#e5eaf0}.report-bar i{display:block;height:100%}.report-empty{padding:12px;background:#f5f7fa;color:#718096}@media print{button{display:none}}
  </style></head><body>${paper.outerHTML}</body></html>`);
  popup.document.close();
  let printed=false;
  const runPrint=()=>{if(printed)return;printed=true;popup.focus();popup.print();};
  popup.addEventListener('load',runPrint,{once:true});
  setTimeout(()=>{try{runPrint();}catch(error){}},700);
}

async function loadTeacherReportCache() {
  const cache = document.getElementById('report-cache');
  if (!cache) return;
  cache.innerHTML = '<div style="color:var(--dim);padding:10px">正在读取已生成报告…</div>';
  const { data, error } = await db.from('teacher_reports').select('id,report_type,tool_scope,period_start,period_end,created_at,report_data').eq('teacher_id', G.userId).order('created_at', { ascending: false }).limit(12);
  if (error) {
    cache.innerHTML = '<div style="color:var(--red);padding:10px">历史报告读取失败</div>';
    return;
  }
  cache.innerHTML = `<div class="report-cache-list">${(data || []).map(item => `<div class="report-cache-item"><div><strong>${reportTypeLabel(item.report_type)}</strong><br><span>${item.period_start} 至 ${item.period_end} · ${reportToolLabel(item.tool_scope)}</span></div><button class="btn btn-xs btn-gray" onclick="openCachedTeacherReport('${item.id}')">打开</button></div>`).join('') || '<div style="color:var(--dim);padding:10px">还没有缓存报告</div>'}</div>`;
  teacherReportState.cached = Object.fromEntries((data || []).map(item => [item.id, item.report_data]));
}

function openCachedTeacherReport(id) {
  const report = teacherReportState.cached?.[id];
  if (!report) return;
  teacherReportState.lastReport = report;
  renderTeacherReport(report);
  document.getElementById('report-output')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function renderTeacherInviteAdmin(container) {
  if (!container || !G.isTeacher) return;
  const { data } = await db.from('invite_codes').select('code,is_active,used_count,max_uses,expires_at,used_at,created_at').eq('role', 'teacher').order('created_at', { ascending: false }).limit(8);
  container.innerHTML = `<section class="teacher-code-admin"><div class="teacher-code-head"><div><div class="assignment-label" style="color:var(--gold)">教师一次性注册码</div><div style="font-size:12px;color:var(--dim);line-height:1.6">每个码只能注册一个教师，7 天后自动过期；每个教师最多同时保留 3 个有效码。生成邀请码不会调用 AI。</div></div><button class="btn btn-xs btn-gold" id="create-teacher-code" onclick="createTeacherInvite()">生成新码</button></div>
    <div class="teacher-code-list">${(data || []).map(item => {
      const expired = item.expires_at && new Date(item.expires_at) <= new Date();
      const available = item.is_active && !expired && item.used_count < item.max_uses;
      return `<div class="teacher-code-row"><div><code>${escH(item.code)}</code><br><span>${available ? `有效至 ${new Date(item.expires_at).toLocaleDateString()}` : item.used_at ? `已使用 · ${new Date(item.used_at).toLocaleDateString()}` : '已失效'}</span></div>${available ? `<button class="btn btn-xs btn-gray" onclick="copyTeacherInvite('${escH(escQ(item.code))}')">复制</button>` : '<span>不可再用</span>'}</div>`;
    }).join('') || '<div style="color:var(--dim);font-size:12px">还没有可用教师注册码</div>'}</div></section>`;
}

async function createTeacherInvite() {
  const button = document.getElementById('create-teacher-code');
  button.disabled = true;
  button.textContent = '生成中…';
  const { data, error } = await db.rpc('create_vq_teacher_invite', { p_valid_days: 7 });
  if (error) {
    toast(`生成失败：${error.message || '请稍后重试'}`, 'err');
  } else {
    await copyTeacherInvite(data);
    toast('新的教师一次性注册码已生成并复制');
    await renderTeacherInviteAdmin(document.getElementById('teacher-invite-admin'));
  }
  if (button?.isConnected) {
    button.disabled = false;
    button.textContent = '生成新码';
  }
}

async function copyTeacherInvite(code) {
  try { await navigator.clipboard.writeText(code); } catch (error) { toast(`教师注册码：${code}`); }
}
