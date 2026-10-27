/* IBI Scientific Calculator v1.3 — Help assistant. A chat-style "how do I…" helper that runs
   entirely on the device: a local knowledge base with keyword + fuzzy matching, no AI and no network.
   Minimise (⌄, Esc, Back) keeps the chat; ⟲ starts again; ✕ ends it. Uses window.ISC from app.js. */
(function () {
  'use strict';
  const I = window.ISC;
  const { $, esc } = I;

  // ---------- knowledge base ----------
  // q: question shown to the user · k: extra search words · s: steps · ex: example text · t: what "Try it" does
  // l: who it is for (s = school, c = college, p = professional) · r: related topic ids
  const calc = (e) => ({ calc: e });
  const KB = [
    { id: 'basics', l: 's', q: 'How do I do a simple sum?', k: 'add subtract multiply divide plus minus times sum arithmetic bodmas order operations equals start begin', s: ['Tap the numbers and signs (+ − × ÷), or type them with a keyboard.', 'Tap <b>=</b> (or press Enter) to get the answer.', 'The calculator follows BODMAS: brackets first, then powers, then × and ÷, then + and −.', 'While you type, the grey number under the sum is a live preview of the answer.'], ex: '2 + 3 × 4', t: calc('2 + 3 × 4'), r: ['brackets', 'clear', 'ans'] },
    { id: 'brackets', l: 's', q: 'How do I use brackets?', k: 'bracket brackets parentheses ( ) open close grouping', s: ['Tap <b>(</b> and <b>)</b>. Every opened bracket must be closed.', 'A number before a bracket multiplies it: 2(3 + 4) means 2 × (3 + 4).', 'The line under your sum shows it the way a textbook would, so you can check the brackets.'], ex: '(2 + 3) × 4 − 2(1 + 1)', t: calc('(2 + 3) × 4 − 2(1 + 1)'), r: ['basics', 'errors'] },
    { id: 'percent', l: 's', q: 'How do I work out a percentage?', k: 'percent percentage % discount gst tax increase decrease markup profit of', s: ['To find 15% of 80, type <b>80 × 15%</b> and tap =.', 'To add 10% (for example GST or a price rise), type <b>200 + 10%</b> → 220.', 'To take off 10% (a discount), type <b>200 − 10%</b> → 180.', 'On the Scientific keypad the % key is in the fourth row; on Basic it is top left.'], ex: '80 × 15%', t: calc('80 × 15%'), r: ['fractions', 'basics'] },
    { id: 'fractions', l: 's', q: 'How do I add or simplify fractions?', k: 'fraction fractions numerator denominator half third quarter simplify mixed improper lcd', s: ['Type a fraction with ÷ or /, for example <b>1/3 + 1/4</b>, and tap =.', 'The answer is shown as a fraction (7/12) with the decimal under it.', 'Tap <b>S⇔D</b> to switch between fraction, mixed number and decimal.', 'To always see decimals first, open ☰ Menu → Answers → Decimal first.'], ex: '1/3 + 1/4', t: calc('1/3 + 1/4'), r: ['sd', 'mixed'] },
    { id: 'mixed', l: 's', q: 'How do I see a mixed number like 1 ½?', k: 'mixed number whole improper fraction', s: ['Work out the sum, for example <b>7/4 + 1</b>.', 'Tap <b>S⇔D</b> until the answer shows as a mixed number (2 ¾).', 'S⇔D cycles: fraction → decimal → mixed number.'], ex: '7/4 + 1', t: calc('7/4 + 1'), r: ['fractions', 'sd'] },
    { id: 'sd', l: 's', q: 'What does S⇔D do?', k: 'sd s<=>d standard decimal exact surd root pi form switch convert decimal to fraction', s: ['S⇔D switches the answer between its exact form and its decimal.', 'Exact forms: fractions (3/4), roots (5√2) and π (3π/4).', 'Tap <b>S⇔D</b> under the answer, or press <b>2nd</b> then <b>±</b> on the Scientific keypad.'], ex: '√(50)', t: calc('√(50)'), r: ['fractions', 'roots'] },
    { id: 'roots', l: 's', q: 'How do I find a square root, cube root or square?', k: 'square root sqrt cube root squared cubed x2 x3 radical √ ∛ nth', s: ['Square root: tap <b>√</b>, type the number, then <b>)</b>. Example √(144).', 'Cube root: tap <b>2nd</b> then <b>√</b> (∛).', 'Square: type the number, then <b>x²</b>. Cube: <b>2nd</b> then <b>x²</b> (x³).', 'Any root: <b>2nd</b> then <b>xʸ</b> (ʸ√x), for example nthRoot(32, 5) = 2.'], ex: '√(144) + 5² − ∛(27)', t: calc('√(144) + 5² − ∛(27)'), r: ['powers', 'sd'] },
    { id: 'powers', l: 's', q: 'How do I work out powers like 2 to the power 10?', k: 'power powers exponent index indices xy x^y raise reciprocal inverse x-1', s: ['Type the base, tap <b>xʸ</b> (it shows ^), then the power: 2^10.', 'Negative or fraction powers need brackets: 8^(1/3), 2^(−1).', 'Reciprocal (1 ÷ x): <b>2nd</b> then <b>n!</b> gives x⁻¹.'], ex: '2^10', t: calc('2^10'), r: ['roots', 'expo'] },
    { id: 'negative', l: 's', q: 'How do I type a negative number?', k: 'negative minus sign plus minus ± change sign', s: ['Tap <b>±</b> after (or before) a number to change its sign, or tap <b>−</b> first.', 'Use brackets with powers: (−3)² = 9, but −3² = −9.'], ex: '(−3)² + −7 × 2', t: calc('(−3)² + −7 × 2'), r: ['basics', 'brackets'] },
    { id: 'clear', l: 's', q: 'How do I delete or clear?', k: 'delete clear backspace erase undo remove ac reset mistake', s: ['<b>⌫</b> deletes the last character (or a whole function name like sin().', '<b>AC</b> clears the sum and the answer.', 'Esc on a keyboard also clears. You can tap anywhere in the sum to move the cursor and fix a mistake.'], r: ['history', 'basics'] },
    { id: 'memory', l: 's', q: 'How do I use memory (M+, M−, MR, MC)?', k: 'memory m+ m- mr mc store recall add memory plus minus', s: ['Work out a number, then tap <b>M+</b> to add it to memory (or <b>M−</b> to subtract it).', '<b>MR</b> puts the memory into your sum. <b>MC</b> clears it.', 'A small orange M in the display means memory is not zero.'], ex: '(250 × 4) then M+, then MR + 100', t: calc('250 × 4'), r: ['variables', 'ans'] },
    { id: 'ans', l: 's', q: 'How do I use the last answer?', k: 'ans answer previous last result continue chain preans', s: ['After =, just tap an operator (× 2) and it carries on from the answer.', 'Or tap <b>Ans</b> to put the last answer anywhere in a new sum.', '<b>2nd</b> then <b>Ans</b> gives PreAns, the answer before that.'], ex: '√(Ans) + 1', t: calc('√(Ans) + 1'), r: ['memory', 'history'] },
    { id: 'history', l: 's', q: 'Where is my history and how do I reuse a sum?', k: 'history past previous sums list reuse old log record', s: ['On a phone tap the clock icon in the display; on a laptop the history is on the right.', 'Tap a sum to put it back in the display, or tap its answer to insert the answer.', 'Tap ✕ on a line to delete it, or Clear to empty the whole history (it asks first).'], r: ['ans', 'backup'] },
    { id: 'keypads', l: 's', q: 'What is the difference between Basic and Scientific keypads?', k: 'basic scientific keypad keys simple mode school layout switch', s: ['<b>Basic</b> has big keys for everyday sums: digits, + − × ÷, %, √, x², brackets.', '<b>Scientific</b> adds sin/cos/tan, logs, powers, factorial, nPr/nCr and the 2nd functions.', 'Switch with the Basic | Scientific buttons above the keys. The app remembers your choice.'], r: ['second', 'functions'] },
    { id: 'second', l: 'c', q: 'What do the 2nd and hyp keys do?', k: '2nd second shift yellow orange labels hyp hyperbolic sinh cosh tanh inverse', s: ['<b>2nd</b> uses the small orange label above a key once: 2nd + sin gives sin⁻¹, 2nd + ln gives eˣ, 2nd + log gives 10ˣ.', '<b>hyp</b> turns sin, cos and tan into sinh, cosh and tanh. hyp + 2nd + sin gives sinh⁻¹.', 'Both switch off by themselves after one key.'], ex: 'sin⁻¹(0.5)', t: calc('sin⁻¹(0.5)'), r: ['trig', 'inverse'] },
    { id: 'trig', l: 's', q: 'How do I work out sin, cos and tan?', k: 'sin cos tan sine cosine tangent trig trigonometry angle triangle sec cosec cot', s: ['Check the display shows <b>DEG</b> for degrees (tap it to change).', 'Tap <b>sin</b>, type the angle, then <b>)</b> and =. Example: sin(30) = 0.5.', 'sec, cosec (csc) and cot are in Functions → Trigonometry.', 'Undefined values such as tan 90° show “Math ERROR”, like a Casio.'], ex: 'sin(30) + cos(60) + tan(45)', t: calc('sin(30) + cos(60) + tan(45)'), r: ['angles', 'inverse', 'second'] },
    { id: 'angles', l: 's', q: 'Why is sin(30) not 0.5? How do I switch degrees and radians?', k: 'degrees radians gradians deg rad grad angle mode unit wrong answer sin 30 wrong', s: ['The chip at the top left of the display shows the angle unit: <b>DEG</b>, <b>RAD</b> or <b>GRAD</b>.', 'Tap it to change. School questions in degrees need DEG.', 'You can force degrees in any mode with the ° key: sin(30°).', 'Graphs and calculus use radians, like every textbook.'], ex: 'sin(30°)', t: calc('sin(30°)'), r: ['trig', 'dms'] },
    { id: 'inverse', l: 's', q: 'How do I find an angle from sin, cos or tan (sin⁻¹)?', k: 'inverse arcsin arccos arctan sin-1 cos-1 tan-1 asin acos atan find angle', s: ['Tap <b>2nd</b>, then <b>sin</b> (sin⁻¹), type the value, <b>)</b> and =.', 'The answer is in the current angle unit (DEG gives degrees).', 'sin⁻¹ of a number above 1 has no real answer; switch ℝ to a+bi to see the complex one.'], ex: 'sin⁻¹(0.5)', t: calc('sin⁻¹(0.5)'), r: ['trig', 'angles'] },
    { id: 'dms', l: 'c', q: 'How do I use degrees, minutes and seconds?', k: 'dms degrees minutes seconds ° ′ ″ sexagesimal latitude bearing', s: ['Type an angle like <b>30°15′20″</b> (° key, then type ′ and ″, or use dms(30, 15, 20)).', 'To show an answer in degrees, minutes and seconds, tap <b>°′″</b> under the answer.'], ex: 'dms(30, 15, 20)', t: calc('dms(30, 15, 20)'), r: ['angles'] },
    { id: 'logs', l: 's', q: 'How do I use log and ln?', k: 'log ln logarithm natural log base 10 base e log2 any base antilog', s: ['<b>log</b> is base 10: log(1000) = 3.', '<b>ln</b> is base e: ln(e) = 1.', 'Any base: log(8, 2) = 3. Antilog: <b>2nd</b> + log gives 10ˣ, <b>2nd</b> + ln gives eˣ.'], ex: 'log(1000) + ln(e²) + log(8, 2)', t: calc('log(1000) + ln(e²) + log(8, 2)'), r: ['powers', 'expo'] },
    { id: 'expo', l: 'c', q: 'How do I type big or small numbers like 3 × 10⁸?', k: 'scientific notation exponent exp ee e power of ten large small standard form 10x', s: ['Type the number, tap <b>×10ˣ</b>, then the power: 3×10^8.', 'Negative powers: 1.6×10^−19.', 'Very big or small answers are shown as a×10ⁿ automatically.'], ex: '3×10^8 × 2', t: calc('3×10^8 × 2'), r: ['format', 'constants'] },
    { id: 'format', l: 'p', q: 'How do I set decimal places, Sci or Engineering format?', k: 'format fix sci eng engineering notation decimal places digits rounding norm display significant', s: ['Tap the <b>Norm</b> chip in the display.', 'Choose Fix (decimal places), Sci (significant digits) or Engineering (powers of 10 in steps of 3).', 'The ENG button under an answer shows it once in engineering form (for example 142.86×10⁻³).', 'round(3.14159, 2) rounds inside a sum.'], ex: 'round(22/7, 3)', t: calc('round(22/7, 3)'), r: ['grouping', 'expo'] },
    { id: 'grouping', l: 's', q: 'Can I show numbers in lakhs and crores (12,34,567)?', k: 'lakh crore indian grouping comma separator thousands digit grouping', s: ['Tap the <b>Norm</b> chip, then under Digit grouping choose <b>12,34,567 (Indian)</b>.', 'International (1,234,567) and no commas are also there.'], ex: '1234567.89', t: calc('1234567.89'), r: ['format'] },
    { id: 'factorial', l: 's', q: 'How do I work out factorial, nPr and nCr?', k: 'factorial n! permutation combination npr ncr choose arrangements selections probability counting', s: ['Factorial: type the number, then <b>n!</b>. 5! = 120.', 'Permutations: tap <b>nPr</b>, type n, comma, r, then ). nPr(5, 2) = 20.', 'Combinations: <b>2nd</b> + nPr gives nCr. nCr(10, 3) = 120.'], ex: 'nCr(10, 3)', t: calc('nCr(10, 3)'), r: ['random', 'stats'] },
    { id: 'hcf', l: 's', q: 'How do I find HCF and LCM?', k: 'hcf lcm gcd highest common factor lowest common multiple greatest common divisor', s: ['Open <b>Functions</b> → Rounding & numbers, or type it: hcf(84, 36) = 12.', 'lcm(4, 6) = 12. Both take two or more numbers.'], ex: 'hcf(84, 36) + lcm(4, 6)', t: calc('hcf(84, 36)'), r: ['primes', 'functions'] },
    { id: 'primes', l: 's', q: 'How do I find prime factors or check a prime?', k: 'prime factor factors factorise factorization composite is prime', s: ['Type <b>factors(360)</b> → 2^3 × 3^2 × 5.', 'Type <b>isPrime(97)</b> → true.'], ex: 'factors(360)', t: calc('factors(360)'), r: ['hcf'] },
    { id: 'random', l: 'c', q: 'How do I get a random number or roll a dice?', k: 'random ran# dice roll toss coin lottery pick randint', s: ['<b>2nd</b> + ×10ˣ gives Ran#, a random number from 0 to 1.', 'ranInt(1, 6) rolls a dice; ranInt(1, 100) picks a whole number from 1 to 100.'], ex: 'ranInt(1, 6)', t: calc('ranInt(1, 6)'), r: ['factorial'] },
    { id: 'variables', l: 'c', q: 'How do I store a value in A, B, x or y?', k: 'variable variables store sto recall a b c x y z assign save value', s: ['Work out an answer, then tap <b>STO →</b> and pick a letter.', 'Or type it: <b>A = 5</b> and tap =.', 'Tap <b>Vars</b> to see every letter and tap one to use it. Variables are kept on this device.'], ex: 'A = 5', t: calc('A = 5'), r: ['userfn', 'memory'] },
    { id: 'userfn', l: 'c', q: 'How do I make my own function like f(x) = x² + 1?', k: 'function define own custom user f(x) formula reuse', s: ['Type <b>f(x) = x² + 1</b> and tap =. It is saved.', 'Then type f(3) to use it → 10.', 'Functions with more letters work too: area(l, w) = l × w.'], ex: 'f(x) = x² + 1', t: calc('f(x) = x² + 1'), r: ['variables', 'graph'] },
    { id: 'complex', l: 'c', q: 'How do I calculate with complex numbers?', k: 'complex imaginary i iota a+bi polar r theta argument modulus conjugate real', s: ['Tap the <b>ℝ</b> chip in the display once: it changes to a+bi (tap again for r∠θ polar form).', 'Type i with <b>2nd</b> + °. Example (2 + 3i)(1 − i) = 5 + i.', 'Functions → Complex numbers has re, im, arg, conj and abs (modulus).'], ex: '(2 + 3i)(1 − i)', t: { cplx: true, calc: '(2 + 3i)(1 − i)' }, r: ['polar', 'quadratic'] },
    { id: 'polar', l: 'c', q: 'How do I convert between polar and rectangular?', k: 'polar rectangular pol rec convert coordinates r theta x y', s: ['pol(x, y) gives [r, θ]: pol(3, 4) = [5, 53.13°].', 'rec(r, θ) gives [x, y]: rec(2, 60) = [1, 1.732].', 'θ uses the current angle unit.'], ex: 'pol(3, 4)', t: calc('pol(3, 4)'), r: ['complex', 'angles'] },
    { id: 'functions', l: 's', q: 'Where can I find every function?', k: 'functions list catalogue all functions find function search menu', s: ['Tap <b>Functions</b> above the keys.', 'Search (for example “root” or “log”) and tap Insert. Each function has an example.'], r: ['keypads', 'second'] },
    { id: 'units', l: 's', q: 'How do I convert units (km to miles, °C to °F, acre to cent)?', k: 'unit units convert conversion km mile kg pound celsius fahrenheit acre cent ground inch cm litre', s: ['Open the <b>Units</b> tab, choose a type, type the value and pick From and To.', 'The table shows the value in every unit of that type.', 'In the Calculate tab you can also type <b>10 inch to cm</b>.', 'Indian land units cent, ground and guntha and gold tola are included.'], ex: '5 km to mi', t: { tab: 'units', state: { cat: 'Length', v: '5', from: 'km', to: 'mi' } }, r: ['constants'] },
    { id: 'constants', l: 'c', q: 'Where are constants like the speed of light or Planck’s constant?', k: 'constant constants speed light planck avogadro gravity g boltzmann physics chemistry value', s: ['Open the <b>Constants</b> tab and search, for example “Planck”.', 'Tap <b>Insert</b> to put it into the calculator, or copy it.', 'π and e are on the keypad.'], t: { tab: 'const' }, r: ['expo', 'units'] },
    { id: 'simultaneous', l: 'c', q: 'How do I solve simultaneous equations?', k: 'simultaneous linear equations system two three four unknowns x y z solve pair', s: ['Open <b>Equations</b> → Simultaneous and choose 2, 3 or 4 unknowns.', 'Type each equation’s numbers in a row: for 2x + 3y = 8 type 2, 3, 8.', 'Tap <b>Solve</b>. It also tells you if there is no solution or infinitely many.'], ex: '2x + 3y = 8 and x − y = −1', t: { tab: 'eqn', state: { mode: 'lin', n: 2, lin: { '2:0_0': '2', '2:0_1': '3', '2:0_2': '8', '2:1_0': '1', '2:1_1': '-1', '2:1_2': '-1' } }, go: '#eqGo' }, r: ['quadratic', 'matrix'] },
    { id: 'quadratic', l: 's', q: 'How do I solve a quadratic equation?', k: 'quadratic equation ax2 bx c roots solve polynomial cubic quartic discriminant vertex degree', s: ['Open <b>Equations</b> → Polynomial → Quadratic.', 'Type a, b and c for ax² + bx + c = 0. For x² − 5x + 6 = 0 type 1, −5, 6.', 'Tap <b>Solve</b> for the roots, the discriminant and the vertex. Cubic and quartic work the same way.'], ex: 'x² − 5x + 6 = 0', t: { tab: 'eqn', state: { mode: 'poly', deg: 2, rel: '=', poly: { a: '1', b: '-5', c: '6' } }, go: '#eqGo' }, r: ['inequality', 'anyeq', 'complex'] },
    { id: 'inequality', l: 'c', q: 'How do I solve an inequality like x² − 3x + 2 > 0?', k: 'inequality inequalities greater less than > < ≥ ≤ range interval', s: ['Open <b>Equations</b> → Polynomial and type the coefficients.', 'Pick the sign: > 0, ≥ 0, < 0 or ≤ 0.', 'Tap <b>Solve</b>: the answer is a range such as x < 1 or x > 2.'], ex: 'x² − 3x + 2 > 0', t: { tab: 'eqn', state: { mode: 'poly', deg: 2, rel: '>', poly: { a: '1', b: '-3', c: '2' } }, go: '#eqGo' }, r: ['quadratic'] },
    { id: 'anyeq', l: 'c', q: 'How do I solve any equation, like cos(x) = x?', k: 'solve equation any nonlinear root numeric find x unknown solver newton', s: ['Open <b>Equations</b> → Any equation.', 'Type it with x, for example <b>x³ − 2x = 5</b>, and the range to search.', 'Tap <b>Solve</b>: every real answer in the range is listed.', 'In the Calculate tab: solve(x³ − 2x − 5, x, 2) finds the answer near 2.'], ex: 'x³ − 2x = 5', t: { tab: 'eqn', state: { mode: 'any', any: 'x^3 - 2x = 5', from: '-100', to: '100', ang: 'rad' }, go: '#eqGo' }, r: ['quadratic', 'graph'] },
    { id: 'graph', l: 's', q: 'How do I draw a graph?', k: 'graph plot draw curve function line parabola sketch axes chart', s: ['Open the <b>Graph</b> tab and type a function of x, for example <b>x² − 4</b>.', 'Add up to six functions; tap the coloured f1 box to hide or show one.', 'Drag to move, pinch or scroll to zoom, ⌂ to reset, the picture button to save it.'], ex: 'y = x² − 4 and y = 2x + 1', t: { tab: 'graph', state: { fns: [{ s: 'x^2 - 4', on: true }, { s: '2x + 1', on: true }, { s: '', on: true }], view: null } }, r: ['graphpoints', 'table'] },
    { id: 'graphpoints', l: 'c', q: 'How do I find where a graph crosses the axis or another graph?', k: 'roots intercept intersection crossing turning point maximum minimum trace point graph read coordinates', s: ['Draw the graphs in the <b>Graph</b> tab.', '“Key points in view” lists roots, minimum and maximum points, y-intercepts and where two graphs cross.', 'Tap one to jump to it, or tap a curve to read any point.'], t: { tab: 'graph', state: { fns: [{ s: 'x^2 - 4', on: true }, { s: '2x + 1', on: true }, { s: '', on: true }], view: null } }, r: ['graph', 'table'] },
    { id: 'table', l: 'c', q: 'How do I make a table of values?', k: 'table values x y list tabulate', s: ['In the <b>Graph</b> tab, type your functions.', 'Under “Table of values” set x from, to and the step. The table updates by itself.'], t: { tab: 'graph', state: { tFrom: '-3', tTo: '3', tStep: '1' } }, r: ['graph'] },
    { id: 'stats', l: 's', q: 'How do I find the mean, median, mode and standard deviation?', k: 'mean average median mode standard deviation sd variance quartile range statistics data list', s: ['Open <b>Statistics</b> and keep 1-variable.', 'Type the numbers in the table, or tap <b>Paste a list</b>. Tick Frequency if values repeat.', 'All results appear at once: mean, median, mode, quartiles, σ and s, and a histogram.', 'In the Calculate tab: mean(2, 4, 9) = 5.'], ex: '12, 15, 11, 18, 15, 20', t: { tab: 'stat', state: { two: false, freq: false, rows: ['12', '15', '11', '18', '15', '20'].map((x) => ({ x, y: '', f: '' })) } }, r: ['regression', 'factorial'] },
    { id: 'regression', l: 'p', q: 'How do I find a regression line or correlation?', k: 'regression line best fit correlation r r2 linear exponential power logarithmic trend predict estimate two variable', s: ['Open <b>Statistics</b> and choose 2-variable (x, y).', 'Type the pairs (or paste two columns from Excel).', 'The Regression card lists linear, quadratic, log, exponential, power and inverse fits with r²; the best fit is marked.', 'Pick one and type x to estimate ŷ (or y to estimate x̂).'], t: { tab: 'stat', state: { two: true, freq: false, model: 'lin', rows: [[1, 2.1], [2, 3.9], [3, 6.2], [4, 7.8], [5, 10.1]].map(([x, y]) => ({ x: String(x), y: String(y), f: '' })) } }, r: ['stats', 'graph'] },
    { id: 'matrix', l: 'c', q: 'How do I find a matrix inverse or determinant?', k: 'matrix matrices determinant det inverse transpose rank rref eigenvalue multiply solve system', s: ['Open <b>Matrix</b>, pick Mat A, set its rows and columns and fill the boxes.', 'Tap an operation: A⁻¹, det A, Aᵀ, A × B, rank, RREF, eigenvalues…', 'Or type your own, like inv(A) × B. Use “Store in” to keep a result in A–D.', 'In the Calculate tab: det([[2, 1], [5, 3]]) = 1.'], ex: 'inverse of [[2, 1], [5, 3]]', t: { tab: 'matrix', state: { cur: 'A', size: { A: [2, 2], B: [2, 2], C: [2, 2], D: [2, 2] }, data: { A: { '0_0': '2', '0_1': '1', '1_0': '5', '1_1': '3' }, B: { '0_0': '1', '0_1': '0', '1_0': '4', '1_1': '2' } }, expr: 'inv(A)', frac: true }, go: '#laGo' }, r: ['vector', 'simultaneous'] },
    { id: 'vector', l: 'c', q: 'How do I find a dot or cross product?', k: 'vector vectors dot cross product magnitude length angle between unit projection 3d', s: ['Open <b>Vector</b>, choose 2D or 3D and fill Vct A and Vct B.', 'Tap A · B (dot), A × B (cross), |A|, Angle A, B, Unit A or Project A on B.', 'In the Calculate tab: cross([1, 2, 3], [4, 5, 6]).'], ex: 'cross([1, 2, 3], [4, 5, 6])', t: calc('cross([1, 2, 3], [4, 5, 6])'), r: ['matrix'] },
    { id: 'integral', l: 'c', q: 'How do I work out a definite integral?', k: 'integral integrate integration area under curve definite ∫ antiderivative calculus', s: ['Open <b>Calculus</b> → Integral, type f(x) and the two limits (inf for ∞), then <b>Work it out</b>.', 'In the Calculate tab: ∫(x², x, 0, 3) = 9 (Functions → Calculus).', 'Calculus uses radians.'], ex: '∫(x², x, 0, 3)', t: calc('∫(x², x, 0, 3)'), r: ['derivative', 'sum'] },
    { id: 'derivative', l: 'c', q: 'How do I differentiate (find dy/dx)?', k: 'derivative differentiate differentiation dy dx slope gradient tangent rate calculus d/dx second derivative', s: ['Open <b>Calculus</b> → Derivative and type f(x). You get the formula, its value at a point and the tangent line.', 'Choose second or third derivative from Order.', 'In the Calculate tab: d/dx(x³, x, 2) = 12 (the slope of x³ at x = 2).'], ex: 'x³ sin(x) at x = 1', t: { tab: 'calculus', state: { mode: 'deriv', d: { f: 'x^3 sin(x)', at: '1', n: 1 } }, go: '#cGo' }, r: ['integral', 'limit'] },
    { id: 'sum', l: 'c', q: 'How do I add a series (Σ) or multiply terms (Π)?', k: 'sum sigma series summation product pi Π Σ sequence total', s: ['Open <b>Calculus</b> → Sum Σ / Product Π, type the term in k and the range.', 'In the Calculate tab: Σ(k², k, 1, 10) = 385 and Π(k, k, 1, 5) = 120.'], ex: 'Σ(k², k, 1, 10)', t: calc('Σ(k², k, 1, 10)'), r: ['integral'] },
    { id: 'limit', l: 'c', q: 'How do I find a limit?', k: 'limit limits approaches tends to infinity lim', s: ['Open <b>Calculus</b> → Limit, type f(x) and the value x approaches (inf for ∞).', 'It checks the left and right sides and says if the limit does not exist.', 'In the Calculate tab: limit(sin(x)/x, x, 0) = 1.'], ex: 'limit(sin(x)/x, x, 0)', t: calc('limit(sin(x)/x, x, 0)'), r: ['derivative'] },
    { id: 'base', l: 'p', q: 'How do I convert to binary or hex and use AND, OR, XOR?', k: 'binary hex hexadecimal octal decimal base convert bits bitwise and or xor not shift programmer two complement', s: ['Open <b>Base-N</b>. Type a number in any of HEX, DEC, OCT or BIN and the others follow. Tap bits to flip them.', 'To calculate, choose the base under “Type in”, then use the keypad: FF AND 0F, 1 << 4, NOT 0.', 'Set the word size (8–64 bits) and Signed or Unsigned.'], ex: 'FF AND 0F (hex)', t: { tab: 'base', state: { base: 16, expr: 'FF AND 0F' } }, r: ['format'] },
    { id: 'errors', l: 's', q: 'What do Syntax ERROR and Math ERROR mean?', k: 'error syntax math error wrong not working problem undefined no real answer divide by zero', s: ['<b>Syntax ERROR</b>: the sum is not written correctly, often a missing bracket.', '<b>Math ERROR</b>: the sum is written correctly but has no answer, such as 1 ÷ 0 or tan 90°.', '“No real answer” (such as √−4): tap ℝ to switch on complex numbers.', 'The message says what is wrong; fix it and tap = again.'], r: ['brackets', 'complex'] },
    { id: 'install', l: 's', q: 'How do I install the app on my phone or laptop?', k: 'install installation app home screen phone android iphone laptop offline shortcut add download icon', s: ['Tap the purple <b>Install</b> button at the top right (it is always there until the app is installed).', 'If your browser can install straight away, it asks you to confirm. If not, it shows the exact steps for your phone or browser (Chrome, Samsung, iPhone Safari, Edge…).', 'Opened from WhatsApp or Instagram? Choose “Open in Chrome” or “Open in Safari” first, then tap Install.', 'Once installed it opens like an app and works without the internet.'], r: ['offline', 'backup'] },
    { id: 'offline', l: 's', q: 'Does it work offline and is my data private?', k: 'offline internet data private privacy safe free cost', s: ['Yes. Every calculation is done on your device; nothing is sent anywhere.', 'After the first visit it works with no internet.', 'It is free, with no ads and no sign-in.'], r: ['install', 'backup'] },
    { id: 'backup', l: 'p', q: 'How do I back up or move my history and variables?', k: 'backup restore save export import data move new phone transfer reset', s: ['☰ Menu → <b>Download backup</b> saves a file with your history, variables, settings and every tab’s data.', 'On the new device: ☰ Menu → <b>Restore from backup</b> and pick the file (it asks before replacing).', '☰ Menu → Reset everything clears the device (download a backup first).'], r: ['history', 'install'] },
    { id: 'theme', l: 's', q: 'How do I switch light or dark mode?', k: 'theme dark light mode colour color night', s: ['On a laptop use the switch at the top right.', 'On a phone: ☰ Menu → App → Dark theme.'], r: ['install'] },
    { id: 'copy', l: 's', q: 'How do I copy the answer or share the app?', k: 'copy paste answer share whatsapp send link', s: ['Tap <b>Copy</b> under the answer.', 'Tap the share icon at the top right to send the app link on WhatsApp, email and more.'], r: ['history'] },
    { id: 'keyboard', l: 'p', q: 'Which keyboard shortcuts can I use?', k: 'keyboard shortcuts type laptop enter escape backspace phone keyboard', s: ['Digits and + − * / ^ ( ) % ! type straight into the sum.', 'Enter works it out, Backspace deletes, Esc clears (or closes a window).', 'On a phone, tap the ⌨ icon to type with the phone keyboard.'], r: ['basics', 'clear'] }
  ];
  const BY = Object.fromEntries(KB.map((t) => [t.id, t]));
  const TAB_TOPIC = { calc: 'basics', eqn: 'quadratic', graph: 'graph', stat: 'stats', matrix: 'matrix', vector: 'vector', calculus: 'integral', base: 'base', units: 'units', const: 'constants' };
  const CHIPS = {
    s: [['Add fractions', 'fractions'], ['Percentage', 'percent'], ['sin 30°', 'trig'], ['Square root', 'roots'], ['Use memory', 'memory'], ['HCF and LCM', 'hcf'], ['Draw a graph', 'graph']],
    c: [['Solve a quadratic', 'quadratic'], ['Simultaneous equations', 'simultaneous'], ['Integrate', 'integral'], ['Differentiate', 'derivative'], ['Mean and SD', 'stats'], ['Complex numbers', 'complex'], ['2nd and hyp keys', 'second']],
    p: [['Regression line', 'regression'], ['Matrix inverse', 'matrix'], ['Binary / hex', 'base'], ['Unit conversion', 'units'], ['Engineering format', 'format'], ['Back up my data', 'backup'], ['Keyboard shortcuts', 'keyboard']]
  };

  // ---------- matching: keywords, prefixes and small typos ----------
  const STOP = new Set('how do i to the a an of in on for is are what can my me with use using does it and or out find get calculate calculator work working please show way which this that be you your there where when why will should could would want need help make doing see type get'.split(' '));
  const norm = (s) => String(s).toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9%√∛πσΣΠ∫²³⁻¹°⇔+\-^!<>≥≤/ ]+/gi, ' ');
  const words = (s) => norm(s).split(/\s+/).filter((w) => w && !STOP.has(w) && !/^\d+$/.test(w));
  function lev(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 9;
    const d = Array.from({ length: a.length + 1 }, (_x, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }
  KB.forEach((t) => { t.W = new Set(words(t.k + ' ' + t.q)); });
  function score(t, toks) {
    let sc = 0;
    for (const w of toks) {
      if (t.W.has(w)) { sc += 3; continue; }
      let best = 0;
      for (const v of t.W) {
        if (w.length >= 3 && v.startsWith(w)) best = Math.max(best, 2);
        else if (v.length >= 4 && w.startsWith(v)) best = Math.max(best, 2);
        else if (w.length >= 4 && v.length >= 4 && lev(w, v) <= (w.length >= 7 ? 2 : 1)) best = Math.max(best, 1.5);
      }
      sc += best;
    }
    return sc;
  }
  function search(q) {
    const toks = words(q);
    if (!toks.length) return [];
    return KB.map((t) => ({ t, s: score(t, toks) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  }

  // ---------- panel ----------
  const root = document.createElement('div');
  root.innerHTML = `<section class="hb-panel" id="hbPanel" role="dialog" aria-label="Help assistant" hidden>
    <div class="hb-head"><svg class="mark" aria-hidden="true"><use href="#i-mark"/></svg><div class="hb-title"><b>Help assistant</b><small>Works offline · ask how to do anything</small></div>
      <button type="button" class="iconbtn" id="hbReset" title="Start again — clear this chat" aria-label="Start again"><svg class="i"><use href="#i-hist"/></svg></button>
      <button type="button" class="iconbtn" id="hbMin" title="Minimise — keep this chat and come back to it" aria-label="Minimise"><svg class="i"><use href="#i-down"/></svg></button>
      <button type="button" class="iconbtn" id="hbClose" title="Close — end this chat" aria-label="Close"><svg class="i"><use href="#i-x"/></svg></button></div>
    <div class="hb-body" id="hbBody" aria-live="polite"></div>
    <div class="hb-foot">
      <div class="hb-levels"><div class="seg" role="tablist" aria-label="Questions for"><button type="button" data-lv="s">School</button><button type="button" data-lv="c">College</button><button type="button" data-lv="p">Work</button></div><button type="button" class="pill" id="hbAll">All topics</button></div>
      <div class="hb-chips" id="hbChips"></div>
      <div class="hb-sugg" id="hbSugg" hidden></div>
      <form class="hb-form" id="hbForm" autocomplete="off"><label class="sr" for="hbIn">Ask a question</label><input class="inp" id="hbIn" placeholder="Ask, e.g. how do I add fractions?" enterkeyhint="send"><button type="submit" class="btn" id="hbSend">Ask</button></form>
    </div></section>`;
  document.body.appendChild(root.firstElementChild);
  const panel = $('#hbPanel'), body = $('#hbBody'), input = $('#hbIn'), btn = $('#helpTop'), pip = $('#helpPip');
  let open = false, token = 0, answers = 0, level = I.LS.get('helpLevel', 's'), started = false;

  function paintLauncher() {
    const n = !open && answers ? answers : 0;
    pip.hidden = !n; pip.textContent = n > 9 ? '9+' : String(n);
    btn.title = n ? `Back to your help chat — ${n} answer${n > 1 ? 's' : ''}` : 'Help: how to use the calculator';
    btn.setAttribute('aria-label', btn.title);
    btn.setAttribute('aria-expanded', String(open));
  }
  function paintChips() {
    document.querySelectorAll('.hb-levels [data-lv]').forEach((b) => b.classList.toggle('on', b.dataset.lv === level));
    $('#hbChips').innerHTML = CHIPS[level].map(([l, id]) => `<button type="button" class="hb-chip" data-topic="${id}">${esc(l)}</button>`).join('');
  }
  const scrollEnd = () => { body.scrollTop = body.scrollHeight; };
  function addMsg(html, who) {
    const d = document.createElement('div');
    d.className = 'hb-msg ' + who;
    d.innerHTML = html;
    body.appendChild(d);
    scrollEnd();
    return d;
  }
  function welcome() {
    addMsg(`<p>Ask how to do anything on this calculator, or tap a question below. Every answer has the key steps and an example you can try.</p>`, 'bot');
  }
  function answerHtml(t) {
    const rel = (t.r || []).filter((id) => BY[id]).map((id) => `<button type="button" class="hb-chip sm" data-topic="${id}">${esc(BY[id].q)}</button>`).join('');
    return `<p class="hb-q">${esc(t.q)}</p><ol>${t.s.map((x) => `<li>${x}</li>`).join('')}</ol>
      ${t.ex ? `<p class="hb-ex">Example: <code>${esc(t.ex)}</code></p>` : ''}
      ${t.t ? `<div class="hb-acts"><button type="button" class="btn" data-try="${t.id}">Try it</button></div>` : ''}
      ${rel ? `<div class="hb-rel"><span>Related</span>${rel}</div>` : ''}`;
  }
  function answer(t, asked) {
    addMsg(esc(asked || t.q), 'me');
    addMsg(answerHtml(t), 'bot');
    answers++;
  }
  function ask(q) {
    q = String(q || '').trim();
    if (!q) return;
    const res = search(q);
    if (res.length && res[0].s >= 3) { answer(res[0].t, q); return; }
    addMsg(esc(q), 'me');
    const sug = (res.length ? res.slice(0, 4).map((x) => x.t) : ['basics', 'functions', 'graph', 'errors'].map((id) => BY[id]));
    addMsg(`<p>I’m not sure which part you mean. Did you mean one of these?</p><div class="hb-rel">${sug.map((t) => `<button type="button" class="hb-chip sm" data-topic="${t.id}">${esc(t.q)}</button>`).join('')}</div><p class="hint">Or tap <b>All topics</b> to see everything I can help with.</p>`, 'bot');
    answers++;
  }
  function allTopics() {
    const g = { s: 'Getting started (school)', c: 'College', p: 'Work and advanced' };
    addMsg('All topics', 'me');
    addMsg(`<p>Here is everything I can help with. Tap a question.</p>${['s', 'c', 'p'].map((lv) => `<p class="hb-q">${g[lv]}</p><div class="hb-rel">${KB.filter((t) => t.l === lv).map((t) => `<button type="button" class="hb-chip sm" data-topic="${t.id}">${esc(t.q)}</button>`).join('')}</div>`).join('')}`, 'bot');
  }
  function openPanel(topicId) {
    if (!started) { started = true; welcome(); }
    if (!open) {
      open = true;
      panel.hidden = false;
      document.body.classList.add('help-open');
      token = Date.now() + Math.random();
      history.pushState({ iscHelp: token }, '');
    }
    if (topicId && BY[topicId]) answer(BY[topicId]);
    paintLauncher();
    requestAnimationFrame(scrollEnd);
    if (!matchMedia('(pointer: coarse)').matches) setTimeout(() => input.focus({ preventScroll: true }), 50);
  }
  function hideNow() {
    open = false;
    panel.hidden = true;
    document.body.classList.remove('help-open');
    $('#hbSugg').hidden = true;
    paintLauncher();
  }
  // Minimise: the history entry is consumed with Back, so the phone Back button and our ⌄ act the same.
  function minimise() {
    return new Promise((res) => {
      if (!open) { res(); return; }
      if (history.state && history.state.iscHelp === token) { waiters.push(res); history.back(); }
      else { hideNow(); res(); }
    });
  }
  let waiters = [];
  window.addEventListener('popstate', () => {
    // Compare with the CURRENT entry: a menu that closes and opens help in the same popstate must not hide it again.
    if (open && !(history.state && history.state.iscHelp === token)) hideNow();
    const w = waiters; waiters = []; w.forEach((f) => f());
  });
  function reset() { body.innerHTML = ''; answers = 0; welcome(); input.value = ''; paintLauncher(); }
  function closeChat() { minimise().then(() => { body.innerHTML = ''; answers = 0; started = false; paintLauncher(); }); }

  async function tryIt(id) {
    const t = BY[id]; if (!t || !t.t) return;
    const a = t.t;
    await minimise();
    if (a.cplx && I.S.cplx === 'real') { const chip = $('#cplxChip'); if (chip) chip.click(); }
    if (a.calc) I.calcRun(a.calc);
    else if (a.tab) I.tryTab(a.tab, a.state || {}, a.go);
    window.scrollTo({ top: 0 });
    I.toast('Example loaded. Tap Help to go back to your chat.');
  }

  // events
  btn.addEventListener('click', () => (open ? minimise() : openPanel()));
  $('#hbMin').addEventListener('click', () => minimise());
  $('#hbClose').addEventListener('click', closeChat);
  $('#hbReset').addEventListener('click', reset);
  $('#hbAll').addEventListener('click', allTopics);
  panel.addEventListener('click', (e) => {
    const lv = e.target.closest('[data-lv]');
    if (lv) { level = lv.dataset.lv; I.LS.set('helpLevel', level); paintChips(); return; }
    const tp = e.target.closest('[data-topic]');
    if (tp) { $('#hbSugg').hidden = true; input.value = ''; answer(BY[tp.dataset.topic]); paintLauncher(); return; }
    const tr = e.target.closest('[data-try]');
    if (tr) tryIt(tr.dataset.try);
  });
  $('#hbForm').addEventListener('submit', (e) => { e.preventDefault(); const q = input.value; input.value = ''; $('#hbSugg').hidden = true; ask(q); });
  input.addEventListener('input', () => {
    const q = input.value.trim(), box = $('#hbSugg');
    if (q.length < 2) { box.hidden = true; return; }
    const res = search(q).slice(0, 4);
    box.hidden = !res.length;
    box.innerHTML = res.map((x) => `<button type="button" data-topic="${x.t.id}">${esc(x.t.q)}</button>`).join('');
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); minimise(); } });

  I.helpEsc = () => { if (!open) return false; minimise(); return true; };
  I.openHelp = (tab) => openPanel(TAB_TOPIC[tab] || 'basics');
  I.helpTopics = KB;
  I.helpSearch = search;
  paintChips(); paintLauncher();
})();
