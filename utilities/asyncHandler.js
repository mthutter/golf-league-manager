// asyncHandler.js
export const catchAsync = (fn) => {
    return (req, res, next) => {
        // If the async function throws an error or rejects, .catch() forwards it to next()
        fn(req, res, next).catch(next);
    };
};