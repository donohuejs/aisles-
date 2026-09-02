if (!localStorage.getItem('aisle_fixture_seeded')) {
  localStorage.setItem('aisle_lists',JSON.stringify([{id:'TEST01',name:'Groceries'},{id:'TEST02',name:'Costco'}]));
  localStorage.setItem('aisle_active_list','TEST01');
  localStorage.setItem('aisle_fixture_seeded','1');
}
