export const prerender = false;

export const load = ({ params }: { params: { id: string } }) => {
	return { id: params.id };
};
