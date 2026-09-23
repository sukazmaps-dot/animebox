/** Decorative support mark. Its animation lives in support-polish.css and respects reduced motion. */
export default function SupportHeartArt() {
  return (
    <div className="support-heart-art" aria-hidden="true">
      <svg className="support-heart-art__mark" viewBox="0 0 320 320" fill="none" xmlns="http://www.w3.org/2000/svg" focusable="false">
        <circle className="support-heart-art__orbit" cx="160" cy="160" r="122" stroke="currentColor" strokeWidth="1" strokeDasharray="2 8" />
        <circle className="support-heart-art__orbit-inner" cx="160" cy="160" r="99" stroke="currentColor" strokeWidth="1" />
        <g className="support-heart-art__pulse">
          <path className="support-heart-art__fill" d="M160 248 74 166c-24-23-25-57-4-79 22-23 58-23 81 0l9 9 9-9c23-23 59-23 81 0 21 22 20 56-4 79l-86 82Z" fill="currentColor" />
          <path d="M160 248 74 166c-24-23-25-57-4-79 22-23 58-23 81 0l9 9 9-9c23-23 59-23 81 0 21 22 20 56-4 79l-86 82Z" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
          <path d="M115 114c14-5 28 0 40 13m50-13c-14-5-28 0-40 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".5" />
        </g>
        <g className="support-heart-art__stars" fill="currentColor">
          <path d="M160 20c3 16 6 19 22 22-16 3-19 6-22 22-3-16-6-19-22-22 16-3 19-6 22-22Z" />
          <path d="M280 129c2 11 5 14 16 16-11 2-14 5-16 16-2-11-5-14-16-16 11-2 14-5 16-16Z" />
          <path d="M54 218c2 9 4 11 13 13-9 2-11 4-13 13-2-9-4-11-13-13 9-2 11-4 13-13Z" />
        </g>
      </svg>
    </div>
  );
}
