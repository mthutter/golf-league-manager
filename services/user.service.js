export function buildUser(member, roles = []) {
  return {
    id: member.id,
    firstName: member.name_first,
    lastName: member.name_last,
    email: member.e_mail,
    roles,
  };
}
