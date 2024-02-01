
// Copyright (c) 2023-2024 Don Organ
//
// CAGESS: Claiming Age Estimator for Social Security
// A javascript tool that takes user input via an HTML form, and generates tables and/or graphs
// based on formulas used by the Social Security Administration to determine retirement benefits
// based on claiming age.
// Claiming age is the enrollee's age when receiving the first monthly benefit payment. Generally
// enrollees can claim first benefits any month between their 62nd and 70th birthdays. Benefit
// payments increase slightly for each month the enrollee defers claiming first benefit.
//
// An enrollee's benefits are affected by his or her work history - the SSA performs calculations
// based on the highest 35 years of averaged indexed monthly earnings. This becomes an input
// (called PIA - primary insurance amount) to this software.
// An enrollee's full retirement age is 66 years for people born 1954 or earlier, 67 for people
// borth 1960 or later and somewhere inbetween (increasing two months per calendar year) for
// those born 1955 through 1959.
//
// This software requires Chart.js - which is available under the MIT license (see notice elsewhere
// in this source code) - generally the HTML file which sources this script should source the
// Chart.js script earlier.
//
//
const start_time = Date.now();

let put_negative_values_in_parenthesis = 0;


function isNumber(value) { // from https://www.shecodes.io/athena/92427-how-to-check-if-a-value-is-a-number-in-javascript
	return typeof value === 'number';
}

// I'd like the following 3 variables to behave to C++'s static variables in a function.
let cagess_color_interpolate_initialized = 0;
let young_rgb_list = [];
let old_rgb_list = [];
function cagess_color_interpolate( value ) // TODO - I need to generalize this for any two colors.
{
	if ( ! cagess_color_interpolate_initialized ) {
		const young_style = getComputedStyle( document.querySelector(".zz_young") );
		const old_style = getComputedStyle( document.querySelector(".zz_old") );
		let young_rgb_list_string = young_style.color.match(/\d+/g);
		let old_rgb_list_string = old_style.color.match(/\d+/g);
		young_rgb_list = young_rgb_list_string.map(Number);
		old_rgb_list = old_rgb_list_string.map(Number);

		cagess_color_interpolate_initialized = 1;
	}
	return "rgb(" + Math.round(String( young_rgb_list[0] + value * (old_rgb_list[0] - young_rgb_list[0]) )) + "," +
		        Math.round(String( young_rgb_list[1] + value * (old_rgb_list[1] - young_rgb_list[1]) )) + "," +
		        Math.round(String( young_rgb_list[2] + value * (old_rgb_list[2] - young_rgb_list[2]) )) + ")";
}


const months_user = [ "Illegal value (0) - should be 1..12",
		"January", "February", "March", "April", "May", "June",
		"July", "August", "September", "October", "November", "December" ];

let cagess_monthly_benefit = new Array(96+1); // 12 months X 8 years. Index by month of retirement start with index=0 at 62 years, 0 months - thru 70 years and 0 months. Dependent on birth-year.
let cagess_birth_year = 0; // 0 is undefined. Should re-initialize cagess_monthly_benefit (above) when the birth-year changes.

function cagess_set_birth_year( new_birth_year )
{
	if (new_birth_year == cagess_birth_year) { return; } // already set, so nothing to do
	cagess_birth_year = new_birth_year;
	cagess_monthly_benefit = new Array(96+1);
	for (let index = 0; index < cagess_monthly_benefit.length; index++ ) {
		let age_year  = 62 + Math.trunc(index / 12);
		let age_month = index % 12;
		let retirement_age = age_year + age_month / 12;
		let calced_benefit = cagess_calc_monthly_benefit( cagess_birth_year,  retirement_age, 1 );
		let my_object =  { age_year: 62 + Math.trunc(index / 12), age_month: index %12, benefit : calced_benefit };
		cagess_monthly_benefit[index] = my_object;
	}	
}



const cagess_chart1_transition = { // Social Security's Full Retirement Age - transitions from 66 years old to 67 for people born in the mid-late 1950s.
	1954: (66+ 0/12),
	1955: (66+ 2/12),
	1956: (66+ 4/12),
	1957: (66+ 6/12),
	1958: (66+ 8/12),
	1959: (66+10/12),
	1960: (67+ 0/12)
};
function cagess_full_retirement_age(birth_year)
{
	if (birth_year <= 1954) { birth_year = 1954; }
	else if (birth_year >= 1960) { birth_year = 1960; }
	return cagess_chart1_transition[birth_year];
}

function string_ycm_to_num(ycm_string)
// Input a string. "72" should return the numeric value of 72. "72.5" should return the numeric value of 72.5.
// If string contains a ':' - consider that as a separator between a year and a 0-based month number. So
// "72:6" should return 72.5 (i.e. 6th month of year 72).
{
	let values = ycm_string.split(":");
	return Number(values[0]) + ( (values.length > 1) ? (Number(values[1])/12) : 0 );
}


function cagess_to_years_months(age, format=0)
{
	let years = Math.floor( age );
	let fractional = age - years;
	let months = Math.round(fractional * 12);
	if (format == 0) {
		if (months==0) { return `${years} y`; }
		return `${years} y,  ${months} m`;
	}
	if (format == 1) { return `${years} years, ${months} months`; }
	if (format == 2) { return `${years}:${months}`; }
	if (format == 3) {
		if (months==0) { return `${years}`; }
		return `${years}:${months}`;
	}
	else { console.error("Internal error: unknown format in cagess_to_years_months(age="+String(age)+", format=" + String(months) + ")"); }
}

function approximatelyEqual( value1, value2, epsilon) { // copied from: https://www.30secondsofcode.org/js/s/approximately-equal/
	return Math.abs( value1 - value2 ) < epsilon;
}

function cagess_calc_monthly_benefit( birth_year, retirement_age, pia=1000, init=0)
{
	let full_retirement_age = cagess_full_retirement_age( birth_year );
	if ( approximatelyEqual( retirement_age, full_retirement_age ) ) { return pia; }

	if (retirement_age < full_retirement_age ) {
		let years_early = full_retirement_age - retirement_age;
		let devalue = 0;
		if (years_early <= 3) {
			devalue = 1 - years_early * 12*5/900
		} else { // > 3 years early
			//devalue = 1 - (years_early * 12*5/900) - ((years_early - 3) * 12 * 5/1200);
			devalue = 1 - (3 * 12*5/900) - ((years_early - 3) * 12 * 5/1200);
		}
		return pia * devalue;
	}
	// Else - delayed retirement - after full retirement age
	if (retirement_age > 70) { retirement_age = 70; } // No benefit for delaying after 70 years old
	let years_late = retirement_age - full_retirement_age;
	let credit_per_year = 0.08; // For anyone born 1943 or later - there's a table we could do a lookup on for earlier - but I think that's moot now.
	return pia * (1 + years_late * credit_per_year);
}

function cagess_get_monthly_benefit(birth_year, retirement_age, pia)
{
	cagess_set_birth_year( birth_year );
	let index = Math.round( (retirement_age - 62) * 12 );
	if (index < 0) { index = 0; }
	if (index > cagess_monthly_benefit.length) { index = cagess_monthly_benefit.length - 1; }
	return cagess_monthly_benefit[index].benefit * pia;
}


function cagess_calc_net_present_value( birth_year, age_at_retirement, age_at_death, interest_rate, pia=1000 )
{
	if (0) { console.log("cagess_calc_net_present_value(birth_year=", birth_year, ", age_at_retirement=", age_at_retirement, ", age_at_death=", age_at_death, ", interest_rate=", interest_rate, ", pia=", pia, ")" ); }
	let monthly_benefit = cagess_get_monthly_benefit( birth_year, age_at_retirement, pia );

	let npv_age = 62; // Can I make this a parameter??? Will need to refactor the code below.

	months_62_until_retirement = (age_at_retirement - 62) * 12;
	if (months_62_until_retirement < 0) { months_62_until_retirement = 0; }

	months_62_until_death = (age_at_death - 62) * 12;
	if (months_62_until_death < 0) { months_62_until_death = 0; }

	let npv = 0;
	for (let months_after_62 = 0; months_after_62 < months_62_until_death; months_after_62++) {
		if (months_after_62 >= months_62_until_retirement) {
			let this_npv = monthly_benefit / Math.pow( (interest_rate/12) / 100 + 1, months_after_62+1 ); // Can this be more efficient? Since monthly_benefit doesn't vary.
			npv += this_npv;
		}
	}
	return npv;
}

function cagess_calc_future_value( birth_year, age_at_retirement, age_at_death, interest_rate, cola, birth_month=0, pia=1000 )
{
	if (0) { console.log("cagess_calc_future_value(birth_year=", birth_year, ", age_at_retirement=", age_at_retirement, ", age_at_death=", age_at_death, ", interest_rate=", interest_rate, ", cola=", cola, " birth_month=", birth_month, ", pia=", pia, ")" ); }
	let monthly_benefit = cagess_get_monthly_benefit( birth_year, age_at_retirement, pia );

	months_62_until_retirement = (age_at_retirement - 62) * 12;
	if (months_62_until_retirement < 0) { months_62_until_retirement = 0; }

	months_62_until_death = (age_at_death - 62) * 12;
	if (months_62_until_death < 0) { months_62_until_death = 0; }

	let multiplicative_factor = (interest_rate/12) / 100 + 1;

	let balance = 0;
	for (let months_after_62 = 0; months_after_62 < months_62_until_death; months_after_62++) {
		if ((months_after_62 > 0) && (months_after_62 % 12) == (11-birth_month)) { monthly_benefit = monthly_benefit * (1 + cola/100); }
		if (months_after_62 >= months_62_until_retirement) {
			balance = balance * multiplicative_factor;
			balance += monthly_benefit
		}
	}
	return balance;
}

function cagess_best_month_npv_62( birth_year, age_at_death, interest_rate, pia=1000)
// Find the best Claiming-Age - i.e. the best month to start collecting SS benefits, based on optimizing net-preset-value calculations for age 62.
// Loop through all the possible ages at retirement (i.e. age 62 thru 70) and identify the one with the best present-value at age 62.
{
	if(0) { console.log("Enter cagess_best_month_npv_62(birth_year=", birth_year, ", age_at_death=", age_at_death, ", interest_rate=", interest_rate ); }
	
	let best_npv = 0;
	let best_month = 0;

	for (let months_after_62 = 0; months_after_62 < (96+1); months_after_62++) {
		let this_npv = cagess_calc_net_present_value( birth_year, 62 + (months_after_62/12), age_at_death, interest_rate );
		if (this_npv > best_npv) {
			best_npv = this_npv;
			best_month = months_after_62;
		}
	}

	return { best_npv: best_npv, best_month: best_month };
}


function cagess_best_month_bank_balance( birth_year, age_at_death, interest_rate, cola=0, birth_month_user=1, pia=1000)
// Find the best month to start collecting SS benefits, based on optimizing net-preset-value calculations for age 62.
{
	if(0) { console.log("Enter cagess_best_month_bank_balance(birth_year=", birth_year, ", age_at_death=", age_at_death, ", interest_rate=", interest_rate, ", cola=", cola, ", birth_month_user=", birth_month_user, ", pia=", pia, ")" ); }
	
	let best_FV = 0;
	let best_month = 0;

	for (let months_after_62 = 0; months_after_62 < (96+1); months_after_62++) {
		let this_FV = cagess_calc_future_value( birth_year, 62 + (months_after_62/12), age_at_death, interest_rate, cola, birth_month_user-1, pia );
		if (this_FV > best_FV) {
			best_FV = this_FV;
			best_month = months_after_62;
		}
	}

	return { best_month : best_month, best_FV : best_FV };
}


function cagess_generate_table_best_bank_balance( parent_id, append0_or_replace1, birth_year, birth_month_user=1, cola=0, pia=1000, age_at_death=100)
{
	let birth_month_adj = birth_month_user-1; // Users months are 1..12. Internally we use 0..11.
	if(0) { console.log("XXXXXX   Enter cagess_generate_table_best_bank_balance(parent_id=", ", append_or_replace=", append_or_replace, ", birth_year=", birth_year, " birth_month: (user=", birth_month_user, ",adjusted=", birth_month_adj, ", cola=", cola, ", pia=", pia, ", age_at_death=", age_at_death ); }

	let col_hdrs = [];
	let row_hdrs = [];
	let data_2d = [];
	// mo = mouseover
	let data_2d_mo = [];
	let data_2d_bgc = []; // background color

	let first_row = true;
	for (aad = 62; aad <=age_at_death; aad += 2) { // foreach row: age-at-death
		row_hdrs.push( aad );
		let this_row = [];
		let this_row_mo = [];
		let this_row_bgc = []
		for (let irate = -4; irate <= 8; irate++) { // for each column
			if (first_row) { col_hdrs.push( parseFloat(irate).toFixed(1) + "%" ); }
			let the_best = cagess_best_month_bank_balance( birth_year, aad, irate, cola, birth_month_adj, pia);
			this_row.push( cagess_to_years_months( 62 + the_best.best_month/12, 2 ) );
			this_row_mo.push( "Best Bank Balance is $"+ parseFloat( the_best.best_FV ).toFixed(2) +
					" for birthday="+ aad + " and interest rate="+ irate+
				"% is with Claiming-Age at "+ cagess_to_years_months( 62 + the_best.best_month/12, 2 ) + "." );
			this_row_bgc.push( cagess_color_interpolate ( the_best.best_month / 96 ) );
		} // for aad
		data_2d.push( this_row );
		data_2d_mo.push( this_row_mo );
		data_2d_bgc.push( this_row_bgc );
		first_row = false;
	} // for irate

	let new_table = cagess_generate_html_table(parent_id, append0_or_replace1, data_2d, col_hdrs, row_hdrs, data_2d_mo, null, null, data_2d_bgc );
	table_caption = new_table.createCaption();
	table_caption.innerHTML = "Best claiming age (year:month) for a given situation of interest rates (columns), longevity (rows), " +
				"COLA ("+ parseFloat(cola).toFixed(1)+ "%) for birth month of "+ months_user[birth_month_user] +
				" " + birth_year+ ". (Based on analyzing bank account balance at indicated birthdays). PIA=$"+pia+"." +
				"<br>Note: Assumes benefits are paid when due (typically they are paid the next month).";

	cagess_create_table_borders( new_table, ["62:0", "70:0"]);
	return new_table;
}


function cagess_generate_table_best_month_npv_62( parent_id, append0_or_replace, birth_year, pia=1000, age_at_death=100)
{
	let col_hdrs = [];
	let row_hdrs = [];
	let data_2d = [];
	// mo = mouseover
	let data_2d_mo = [];
	let data_2d_bgc = []; // background color

	let first_row = true;
	for (aad = 62; aad <=age_at_death; aad += 2) { // foreach row: age-at-death
		row_hdrs.push( aad );
		let this_row = [];
		let this_row_mo = [];
		let this_row_bgc = []
		for (let irate = -4; irate <= 8; irate++) { // for each column
			if (first_row) { col_hdrs.push( parseFloat(irate).toFixed(1) + "%" ); }
			let the_best = cagess_best_month_npv_62( birth_year, aad, irate, pia);
			this_row.push( cagess_to_years_months( 62 + the_best.best_month/12, 2 ) );
			this_row_mo.push( "NPV (at age 62)=$" + parseFloat( the_best.best_npv ).toFixed(0) );
			this_row_bgc.push( cagess_color_interpolate ( the_best.best_month / 96 ) );
		} // for aad
		data_2d.push( this_row );
		data_2d_mo.push( this_row_mo );
		data_2d_bgc.push( this_row_bgc );
		first_row = false;
	} // for irate

	let new_table = cagess_generate_html_table(parent_id, append0_or_replace, data_2d, col_hdrs, row_hdrs, data_2d_mo, null, null, data_2d_bgc );
	table_caption = new_table.createCaption();
	table_caption.innerHTML = "Z3 Best Claiming-Age (year:month) for a given situation of interest rates (columns) and longevity (rows), for birth-year "+ birth_year + ". (Based on analyzing NPV at age 62). PIA=$"+pia+".";

	cagess_create_table_borders( new_table, ["62:0", "70:0"]);
	return new_table;
}


function cagess_generate_html_table(parent_id, append0_or_replace1, data_2d, col_hdrs=null, row_hdrs=null, mouseover_data_2d=null, mouseover_col_hdrs=null, mouseover_row_hdrs=null, data_2d_bgc=null)
{
	let my_parent = document.getElementById(parent_id);
	if (my_parent == null) { console.log("ERROR: no element found with id=", parent_id); return null; }

	let table = null;
	if (append0_or_replace1) { // replace
		table_list = my_parent.querySelectorAll("table");
		table = table_list[ table_list.length-1];
		while (table.hasChildNodes()) {
			table.removeChild(table.lastChild);
		}
	} else { // append
		table = document.createElement("table");
	}

	// Create table-header first
	if (col_hdrs != null) {
		let thead = table.createTHead();
		let hrow = thead.insertRow();
		if (row_hdrs != null) { // Create an empty cell above the row headers
				hrow.insertCell();
		}
		for (let col_idx = 0; col_idx < col_hdrs.length; col_idx++) {
			if (mouseover_col_hdrs != null) { // mouseover - need to make a div
				let cell = hrow.insertCell();
				cell.outerHTML = "<th><div title=" + mouseover_col_hdrs[col_idx] + ">"+col_hdrs[col_idx]+"</div></th>";
			} else {
				let cell = hrow.insertCell();
				cell.outerHTML = "<th>"+col_hdrs[col_idx]+"</th>";
			}
		}
	}

	// create table-body
	let tbody = table.createTBody();
	for (let row_idx = 0; row_idx < data_2d.length; row_idx++) {
		let body_row = tbody.insertRow(-1);
		if (row_hdrs != null) {
			let header_cell = body_row.insertCell();
			header_cell.outerHTML = "<th>"+row_hdrs[row_idx]+"</th>";
		}
		for (let col_idx = 0; col_idx < data_2d[row_idx].length; col_idx++) {
			let cell = body_row.insertCell();
			cell.innerHTML = data_2d[row_idx][col_idx];
			if (mouseover_data_2d != null) {
				cell.title = mouseover_data_2d[row_idx][col_idx];
			}
			if (data_2d_bgc != null) {
				//cell.bgColor = data_2d_bgc[row_idx][col_idx];
				cell.style.backgroundColor = data_2d_bgc[row_idx][col_idx];
			}
		}
	}

	my_parent.appendChild(table);
	return table;
}





function cagess_create_table_borders( the_table, values)
// Search through the previously created table. Add borders to cells which contain one of the incicated values, but whose neighbor
// doesn't. Add the border only the appropriate border - e.g. the bottom border if on cell has the value and the neighbor below does not.
{
	let number_rows = the_table.rows.length;
	let number_cols = the_table.rows[0].cells.length;
	for (let row_index = 0; row_index < number_rows; row_index++ ) {
		for (let col_index = 0; col_index < number_cols; col_index++ ) {
			if ((row_index+1) < number_rows ) { // check against next row
				let this_value = the_table.rows[row_index  ].cells[col_index].innerText;
				let next_value = the_table.rows[row_index+1].cells[col_index].innerText;
				if (the_table.rows[row_index  ].cells[col_index].nodeName === the_table.rows[row_index+1].cells[col_index].nodeName ) {
					for (value of values) {
						if ( ( (value === this_value) || (value === next_value) ) && (this_value != next_value) ) {
							the_table.rows[row_index  ].cells[col_index].style.borderBottom = "1px solid black";
							the_table.rows[row_index+1].cells[col_index].style.borderTop    = "1px solid black";
						}
					}
				}
			}
			if ((col_index+1) < number_cols ) { // check against next cell (same row)
				if (the_table.rows[row_index].cells[col_index  ].nodeName === the_table.rows[row_index].cells[col_index+1].nodeName ) {
					let this_value = the_table.rows[row_index].cells[col_index  ].innerText;
					let next_value = the_table.rows[row_index].cells[col_index+1].innerText;
					for (value of values) {
						if ( ( (value === this_value) || (value === next_value) ) && (this_value != next_value) ) {
							the_table.rows[row_index].cells[col_index  ].style.borderRight = "1px solid black";
							the_table.rows[row_index].cells[col_index+1].style.borderLeft  = "1px solid black";
						}
					}
				}
			}

		}
	}
}


function format_date(start_year, num_months) // num_months may be much greater than 12.
{
	let the_date = start_year + num_months / 12;
	let the_year = Math.floor( the_date );
	let month = (num_months % 12) + 1;
	return months_user[month] + " " + String( the_year);
}

function ErrorMessage(messages_id, the_message)
{
	let the_element = document.getElementById(messages_id);
	if (the_element == null) {
		console.log("ERROR - what to do??? messages_id (", messages_id,") in function ErrorMessage(), returns null");
		console.log("ERROR (cont'd): the_message=", the_message);
	}
	the_element.innerHTML += the_message + "<br>";
}


function cagess_generate_payment_table( parent_id, append0_or_replace1, birth_year, birth_month_user, pia=1000 )
{
	if (0) { console.log("Enter cagess_generate_payment_table(parent_id=", parent_id, ", append_or_replace=", append0_or_replace1, ", birth_year=", birth_year, ", birth_month_user=", birth_month_user, ", pia=", pia, ")"); }

	let my_parent = document.getElementById(parent_id);
	if (my_parent == null) { console.log("ERROR: no element found with id=", parent_id); return null; }

	let table = null;
	if (append0_or_replace1) { // replace
		table_list = my_parent.querySelectorAll("table");
		table = table_list[ table_list.length-1];
		while (table.hasChildNodes()) { // clear out the existing table
			table.removeChild(table.lastChild);
		}
		table.classList.add("replaced");
	} else {
		table = document.createElement("table");
		table.id = "appended";
		table.classList.add("appended");
	}
	table.id = "cagess_payment_table";
	table.classList.add("generated");


	cagess_set_birth_year( birth_year ); // initializes cagess_monthly_benefit[]
	let full_retirement_age = cagess_full_retirement_age( birth_year );
	let full_retirement_index = (full_retirement_age-62) * 12;

	// Create table-header first
	let thead = table.createTHead();
	let hrow1 = thead.insertRow();

	// The header row
	let cell = hrow1.insertCell();
	cell.outerHTML = "<th></th>";

	cell = hrow1.insertCell();
	cell.outerHTML = "<th>Claiming Age (years:months)</th>";

	cell = hrow1.insertCell();
	cell.outerHTML = "<th>Claiming Date</th>";

	cell = hrow1.insertCell();
	cell.outerHTML = "<th>Early, Normal or Late Retirement - per SSA</th>";

	cell = hrow1.insertCell();
	cell.outerHTML = "<th>Monthly Retirement Benefit (based on PIA=$" + parseFloat(pia).toFixed(2) + ") Note: benefits are paid the following month.</th>";

	cell = hrow1.insertCell();
	cell.outerHTML = "<th>Monthly Benefit Increase from previous month</th>";

	cell = hrow1.insertCell();
	cell.outerHTML = "<th>Ratio to Monthly Benefit claimed at age 62</th>";

	cell = hrow1.insertCell();
	cell.outerHTML = "<th>Ratio to Full Retirement Benefit (i.e. claimed at age " + cagess_to_years_months(full_retirement_age, 3) + ")</th>";



	// create table-body
	let tbody = table.createTBody();
	for (let months_after_62 = 0; months_after_62 < (8*12)+1; months_after_62++) { // each row
		let body_row = tbody.insertRow(-1);
		let header_cell = body_row.insertCell();
		header_cell.outerHTML = "<th>" + (months_after_62+1) + "</th>";

		header_cell = body_row.insertCell();
		header_cell.innerHTML = cagess_to_years_months( 62 + months_after_62/12, 2);

		header_cell = body_row.insertCell();
		header_cell.innerHTML = format_date(birth_year+62, birth_month_user-1+months_after_62);
		
		header_cell = body_row.insertCell();
		if (months_after_62 < full_retirement_index) { header_cell.innerHTML = "Early"; }
		else if (months_after_62 == full_retirement_index) { header_cell.innerHTML = "Normal"; }
		else { header_cell.innerHTML = "Late"; }

		let cell = body_row.insertCell();
		cell.innerHTML = "$" + parseFloat( cagess_monthly_benefit[months_after_62].benefit * pia ).toFixed(2);

		cell = body_row.insertCell();
		cell.innerHTML = (months_after_62 == 0) ? "" :
				(parseFloat( 100*cagess_monthly_benefit[months_after_62].benefit / cagess_monthly_benefit[ months_after_62-1].benefit -100 ).toFixed(2) + "%");

		cell = body_row.insertCell();
		cell.innerHTML = parseFloat( (100* cagess_monthly_benefit[months_after_62].benefit / cagess_monthly_benefit[0].benefit )).toFixed(1) + "%";

		cell = body_row.insertCell();
		cell.innerHTML = parseFloat( 100* cagess_monthly_benefit[months_after_62].benefit / cagess_monthly_benefit[ full_retirement_index ].benefit ).toFixed(1) + "%";

	} // for months_after_62

	if (append0_or_replace1 == 0) { my_parent.appendChild(table); }
	table_caption = table.createCaption();
	table_caption.innerHTML = "Monthly Retirement benefit, based on PIA=$<b>" + String(pia) + "</b> for claimant born in <b>" + months_user[birth_month_user] + " " + String(birth_year) + "</b>.";

	return table;
}


// Moved the following out of cagess_generate_table_bank_balance(...) and made global so I could destroy and recreate - to
// allow re-animation via a click-button (it seems I should be able to achieve this without creating globals, but I
// didn't figure that out).
var my_chart = null;
var my_animation = null;
var my_config = null;


function cagess_generate_table_bank_balance( parent_id, append0_or_replace1, birth_year, birth_month_user=1,
	claiming_age_array, max_age, interest_percent=0, cola_percent=0, pia=1000, arrears=0, messages_id=null,
	paydownbalance=0, borrow_irate=0, spendit=0, animation_speed=0, max_animation_skew_ms = 3000)
// birth_month_user should be 1..12
// claiming_age_array - array of values indicating year (and perhaps fractional month) - so 64+5/12 (=64.4166) means at age 64 years and 5 months.
// arrears: SSA pays benefits about 1 month in arrears (i.e. February benefits are paid in March, etc.). Arrears=0 means to calculate and show
// 	based on when benefits are earned (i.e. not in arrears). arrears=1 means to calculate and show based on when benefits are received
// 	(i.e. in arrears).
{
	if (0) {console.log("Enter cagess_generate_table_bank_balance(parent_id=", parent_id, ", append0_or_replace1=", append0_or_replace1,
		", birth_year=", birth_year, ", birth_month_user=", birth_month_user, ", claiming_age_array=", claiming_age_array,
		", max_age=", max_age, ", interest_percent=", interest_percent, ", cola_percent=", cola_percent,  ", pia=", pia,
		", arrears=", arrears, ", messages_id=", messages_id,
		", paydownbalance=", paydownbalance, ", borrow_irate=", borrow_irate,
		", spendit=", spendit, ", animation_speed=", animation_speed, ", max_animation_skew_ms=", max_animation_skew_ms, ")" );
	}
	let my_parent = document.getElementById(parent_id);
	if (my_parent == null) { console.log("ERROR: no element found with id=", parent_id); return null; }

	let alert_counter = 0; // To avoid seemingly endless error messages in some situations.

	//let claiming_age_array_cleaned = claiming_ages_string_to_values( claiming_age_array );
	let claiming_age_array_cleaned = claiming_age_array;

	if (true) { // argument checking
		let error_count = 0;
		if (!isNumber(append0_or_replace1) ||  (append0_or_replace1 < 0) || (append0_or_replace1 > 1)) {
			ErrorMessage(messages_id, "ERROR: append0_or_replace1="+ append0_or_replace1+ ", expecting value of either 0 or 1.");
			error_count++;
		}
		if (!isNumber(birth_year) || (birth_year < 1900) || (birth_year > 2050)) {
			ErrorMessage(messages_id, "ERROR: birth_year="+ birth_year+ ", expecting value of between 1900 and 2050.");
			error_count++;
		}
		if (!isNumber(birth_month_user) || (birth_month_user < 1) || (birth_month_user > 120)) {
			ErrorMessage(messages_id, "ERROR: birth_month_user="+birth_month_user+ ", expecting value of between 1 and 12.");
			error_count++;
		}
		if (claiming_age_array_cleaned.length < 1) {
			ErrorMessage(messages_id, "ERROR: claiming_are_array's length="+ claiming_array_array.length+ ", expecting length of at least 1");
			error_count++;
		}
		if (!isNumber(max_age) || (max_age < 62) || (max_age > 200) ) {
			ErrorMessage(messages_id, "ERROR: max_age="+ max_age+ ", expecting value >= 62 and < 150.");
			error_count++;
		}
		if (!isNumber(interest_percent) || (interest_percent < -100) || (interest_percent > 1000) ) {
			ErrorMessage(messages_id, "ERROR: interest_percent="+ interest_percent+ "%, seems out of range of reasonable values.");
			error_count++;
		}
		if (!isNumber(cola_percent) || (cola_percent < -100) || (interest_percent > 1000) ) {
			ErrorMessage(messages_id, "ERROR: cola_percent="+ cola_percent+ "%, seems out of range of reasonable values.");
			error_count++;
		}
		if (!isNumber(pia) || (pia < 0) || (pia > 50000) ) {
			ErrorMessage(messages_id, "ERROR: pia=$"+ pia+ ", seems out of range of reasonable values.");
			error_count++;
		}
		if (!isNumber(arrears) || (arrears < 0) || (arrears > 1) ) {
			ErrorMessage(messages_id, "ERROR: arrears="+ arrears+ ", expecting value of either 0 or 1.");
			error_count++;
		}
		if (!isNumber(paydownbalance) || (paydownbalance < 0) || (paydownbalance > 10000000) ) {
			ErrorMessage(messages_id, "ERROR: paydownbalance=$"+ paydownbalance+ ", seems out of range of reasonable values.");
			error_count++;
		}
		if (!isNumber(borrow_irate) || (borrow_irate < 0) || (borrow_irate > 25) ) {
			ErrorMessage(messages_id, "ERROR: borrow_irate=%"+ borrow_irate+ ", seems out of range of reasonable values.");
			error_count++;
		}
		if (!isNumber(spendit) || (spendit < 0) || (spendit > 10000) ) {
			ErrorMessage(messages_id, "ERROR: spendit=$"+ spendit+ ", seems out of range of reasonable values.");
			error_count++;
		}

		if (!isNumber(animation_speed) || (animation_speed < 0) || (animation_speed > 10000) ) {
			ErrorMessage(messages_id, "ERROR: animation_speed="+ animation_speed+ ", seems out of range of reasonable values.");
			error_count++;
		}
		if (!isNumber(max_animation_skew_ms) || (max_animation_skew_ms < 0) || (max_animation_skew_ms > 100000) ) {
			ErrorMessage(messages_id, "ERROR: max_animation_skew="+ max_animation_skew_ms+ ", seems out of range of reasonable values.");
			error_count++;
		}

		if (error_count > 0) {
			return null;
		}
	}


	let table = null;
	if (append0_or_replace1) { // replace
		table_list = my_parent.querySelectorAll("table");
		table = table_list[ table_list.length-1];
		while (table.hasChildNodes()) { // clear out the existing table
			table.removeChild(table.lastChild);
		}
		table.classList.add("replaced");
	} else {
		table = document.createElement("table");
		table.id = "appended";
		table.classList.add("appended");
	}
	table.id = "cagess_bank_balance_table";
	table.classList.add("generated");


	let benefit = []; // indexed same as in claiming_age_array_cleaned
	let balance = []; // indexed same as in claiming_age_array_cleaned


	cagess_set_birth_year( birth_year );
	for (let ii=0; ii<claiming_age_array_cleaned.length; ii++) {
		let claiming_age = claiming_age_array_cleaned[ii];
		let months_after_62 = Math.round( (claiming_age - 62) * 12 );
		benefit.push( cagess_monthly_benefit[months_after_62] );
		balance.push( -paydownbalance );
	}

	//let accumulated_cola_percent = 0;
	let cola_factor = 1;
	let interest_per_month = (interest_percent/100) / 12;

	// Create table-header first
	let thead = table.createTHead();
	let hrow1 = thead.insertRow();

	// The header is 3 rows
	let cell = hrow1.insertCell(); // column 1
	cell.outerHTML = "<th rowspan=\"3\"></th>";

	if (arrears == 0) { // payment not in arrears - i.e. with payement and due dates the same.
		cell = hrow1.insertCell(); // column 2
		cell.outerHTML = "<th rowspan=\"3\">Date<br><small>(end of month)</small></th>";
	} else { // payment in arrears - i.e. payment is a month after due date.
		cell = hrow1.insertCell(); // column 2
		cell.outerHTML = "<th rowspan=\"3\">Benefit Due Date</th>";
		cell = hrow1.insertCell(); // column 3
		cell.outerHTML = "<th rowspan=\"3\">Benefit Payment Date</th>";
	}

	cell = hrow1.insertCell(); // column 3 (if not arrears, otherwise column 4
	cell.outerHTML = "<th rowspan=\"3\">Age (years:months)</th>";

	if (cola_percent != 0) {
		let th = document.createElement("th");
		th.innerHTML = "COLA factor";
		th.title = "Cost of Living Adjustment to compensate for inflation. A multiplicative factor. " +
			"Updated annually by the SSA and applied every December (reflected in the January payment)." +
			" This table uses an annual COLA of " + cola_percent +"%.";
		th.rowSpan = 3
	hrow1.appendChild(th);
	}

	if (spendit != 0) {
		let th = document.createElement("th");
		th.innerHTML = "Spending ($)";
		th.title = "Monthly deduction from the Bank Balance" + ((claiming_age_array_cleaned.length > 1) ? "(s)" : "") +
			" of $" + spendit +
			". If Bank Balance is negative, then interest is charged at an annual rate of " + borrow_irate + "%.";
		th.rowSpan = 3
		hrow1.appendChild(th);
	}


	let num_data_columns = claiming_age_array_cleaned.length * 3;
	th = document.createElement("th");
	th.colSpan = num_data_columns;
	th.innerHTML = "Claiming-Age (year:month) Benefit Calculations";

	hrow1.appendChild(th);


	if (claiming_age_array_cleaned.length > 1) {
		let th = document.createElement("th");
		th.innerHTML = "Best Claiming-Age";
		th.title = "For each row, identifies the Claiming-Age with highest Bank Balance.";
		th.rowSpan = "3";
		hrow1.appendChild(th);
	}


	// Header Row 2
	let hrow2 = thead.insertRow();
	let odd_column_group = false;
	for (claiming_age of claiming_age_array_cleaned) {
		odd_column_group = ! odd_column_group;
		let th = document.createElement("th");
		th.innerHTML = cagess_to_years_months(claiming_age,2);
		th.title = "Claiming-Age: " + cagess_to_years_months( claiming_age ) + ".";
		th.colSpan = "3";
		th.classList.add(odd_column_group ? "odd_column_group" : "even_column_group");
		hrow2.appendChild(th);
	}

	// Header Row 3
	let hrow3 = thead.insertRow();

	odd_column_group = false;
	for (claiming_age of claiming_age_array_cleaned) {
		odd_column_group = ! odd_column_group;
		let th = document.createElement("th");
		th.innerHTML = "Interest on Balance ($)";
		th.title = (paydownbalance == 0)
			?  ("Monthly interest earned on the previous Bank Balance. Annual interest rate is "+interest_percent+"%.")
			:  ("Monthly interest - initially amount charged on the loan (negative) Bank Balance at " + borrow_irate +
				"%, and then after the load is paid off, the interest earned on the positive Bank Balance at " + interest_percent + "%.")
			;
		th.classList.add(odd_column_group ? "odd_column_group" : "even_column_group");
		hrow3.appendChild(th);

		th = document.createElement("th");
		th.innerHTML = "Benefit payment from SSA ($)";
		th.title = "Payment from the Social Security Administration (i.e. the monthly benefit). Doesn't start until Claiming-Age ("+cagess_to_years_months(claiming_age,2)+", adjusted for COLA ("+cola_percent+"%) every January.";
		th.classList.add(odd_column_group ? "odd_column_group" : "even_column_group");
		hrow3.appendChild(th);

		th = document.createElement("th");
		th.innerHTML = "Bank Balance ($)";
		th.title = "Theoritical bank account balance given indicated history of Social Security check deposts and at indicated interest rates and COLA";
		th.classList.add(odd_column_group ? "odd_column_group" : "even_column_group");
		hrow3.appendChild(th);
	}


	let datasets = []; // for plotting - list of datasets where each dataset represents a single plot-line for each claiming-age -
				// containing the actual (Y values) data in an array named data.
	let labels = []; // for plotting - X axis labels


	let num_months = (max_age - 62) * 12 + arrears;
	let starting_months_after_62 = (paydownbalance > 0) ? -1 : 0;
	// create table-body
	let tbody = table.createTBody();
	let row_index = 0;
	for (let months_after_62 = starting_months_after_62; months_after_62 <= num_months; months_after_62++) { // each row
		let body_row = tbody.insertRow(-1);
		let header_cell = body_row.insertCell();
		header_cell.outerHTML = "<th>"+(months_after_62+1)+"</th>";

		header_cell = body_row.insertCell();
		header_cell.outerHTML = "<th>"+format_date(birth_year+62, birth_month_user-1+months_after_62)+"</th>";
		
		labels.push( format_date(birth_year+62, birth_month_user-1+months_after_62 ) +  " " + cagess_to_years_months(62+months_after_62/12, 2) );

		if (arrears) {
			header_cell = body_row.insertCell();
			header_cell.outerHTML = "<th>"+format_date(birth_year+62, birth_month_user-1+months_after_62+1)+"</th>";
		}

		header_cell = body_row.insertCell();
		//header_cell.outerHTML = "<th>"+ String(Math.floor(62 + (birth_month_user-1+months_after_62)/12)) + ":"+ months_after_62%12 + "</th>";
		header_cell.outerHTML = "<th>"+ cagess_to_years_months( 62 + months_after_62/12, 2) + "</th>";

		if ( ((birth_month_user-1+months_after_62)%12) == 11) { cola_factor *= 1+cola_percent/100; } // COLA increase is in Dec benefit (typically paid in Jan)

		if (cola_percent != 0.0) {
			header_cell = body_row.insertCell();
			//if (months_after_62 >= 0) { header_cell.outerHTML = "<th>" + parseFloat(cola_factor).toFixed(3) + "</th>"; }
			header_cell.outerHTML = "<th>" + ((months_after_62 >= 0) ? parseFloat(cola_factor).toFixed(3) : "") + "</th>";
		}

		if (spendit != 0) {
			spendit_cell = body_row.insertCell();
			spendit_cell.outerHTML = "<th>" + spendit + "</th>";
		}

		let best_balance = 0;
		let best_balance_ii = 0;
		odd_column_group = false;
		for (ii=0; ii< claiming_age_array_cleaned.length; ii++) { // column groups
			if (row_index == 0) {
				datasets.push( { label: cagess_to_years_months( claiming_age_array_cleaned[ii], 3 ),
						fill: false,
					borderWidth: 0.5,
					borderDash: [5, 8],
						data: []
						} );
			}

			odd_column_group = ! odd_column_group;
			let this_interest = (balance[ii] >= 0) ?  (balance[ii] * interest_per_month) : (balance[ii] * borrow_irate/100 / 12)
			let cell = body_row.insertCell();
			cell.classList.add(odd_column_group ? "odd_column_group" : "even_column_group");
			if (months_after_62 >= 0) {
				cell.innerHTML = parseFloat( this_interest ).toFixed(2);
				if (put_negative_values_in_parenthesis && (this_interest < 0) ) { cell.innerHTML = "(" + cell.innerHTML + ")"; }
				if (this_interest < 0) { cell.classList.add( "negative_dollars" ); }
				if (this_interest ==  0) { cell.classList.add("zero_dollars"); }
			}

			cell = body_row.insertCell();
			cell.classList.add(odd_column_group ? "odd_column_group" : "even_column_group");
			let new_balance = balance[ii];
			if ((months_after_62 >= 0) && (months_after_62 < num_months)) {
				let benefit_obj = benefit[ii];
				let month_benefit_starts = (benefit_obj.age_year-62)*12 + benefit_obj.age_month;
				let this_benefit = 0;
				if ((months_after_62 >= (month_benefit_starts + arrears)) && (months_after_62 <= ((max_age-62)*12) ) ) {
					//this_benefit = benefit_obj.benefit * pia * (1 + accumulated_cola_percent/100);
					this_benefit = benefit_obj.benefit * pia * cola_factor;
				}
				cell.innerHTML = parseFloat( this_benefit ).toFixed(2);
				if (this_benefit ==  0) { cell.classList.add("zero_dollars"); }

				new_balance += this_benefit + this_interest - spendit;
			}

			cell = body_row.insertCell();
			cell.classList.add(odd_column_group ? "odd_column_group" : "even_column_group");
			cell.innerHTML = parseFloat( new_balance ).toFixed(2);
			if (put_negative_values_in_parenthesis && (new_balance < 0) ) { cell.innerHTML = "(" + cell.innerHTML + ")"; }
			if (new_balance < 0) { cell.classList.add( "negative_dollars" ); }
			if (new_balance ==  0) { cell.classList.add("zero_dollars"); }
			balance[ii] = new_balance;

			if (months_after_62 >= 0) {
				if (new_balance > best_balance) {
					best_balance = new_balance;
					best_balance_ii = ii;
				}
			}

			datasets[ii].data.push( parseFloat(balance[ii]).toFixed(2) );
		} // for ii < claiming_age_array_cleaned.length - column groups

		if (claiming_age_array_cleaned.length > 1) {
			cell = body_row.insertCell();
			cell.innerHTML = cagess_to_years_months(claiming_age_array_cleaned[ best_balance_ii],2);
			cell.style.backgroundColor = cagess_color_interpolate( (claiming_age_array_cleaned[ best_balance_ii]-62) * 12 / 96 );
		}
		row_index++;
	} // for months_after_62


	// Row for notes...
	let notes_row = tbody.insertRow(-1);
	let notes_cell = notes_row.insertCell();
	notes_cell.classList.add( "notes" );
	let number_of_columns = 4 + claiming_age_array_cleaned.length * 3 + ((claiming_age_array_cleaned.length > 1) ? 1 : 0);
	notes_cell.setAttribute("colspan", number_of_columns);
	let the_HTML = "<b>Notes</b>:<ol>";
	the_HTML += "<li>The Social Security Administration pays benefits the month after (e.g. the June benefit is paid in July).";
	if (! arrears) { the_HTML += " However, the table is simplified, showing benefit payment in the month earned."; }
	the_HTML += "</li>"
	the_HTML += "<li>Benefits are <i>NOT</i> paid for the month of death.</li>";
	the_HTML += "<li>COLA adjustments are made for the December benefit which is paid in January.</li>";
	the_HTML += "<li>Benefits are paid on various days of the month depending on the claimant's birthday. Thus that could affect "
				+ "the amount of interest paid by a bank. This detail is not accounted for in the calculations.</li>";
	the_HTML += "</ol>";
	notes_cell.innerHTML = the_HTML;



	if (append0_or_replace1 == 0) { my_parent.appendChild(table); }
	table_caption = table.createCaption();
	table_caption.innerHTML = "Accumulating bank balance approach (aka Future Value) for optimizing Claiming-Age for Social Security benefits. " +
				"Simulates depositing every monthly Social Security benefit payment into a bank account paying <b>"+
				interest_percent+"%</b> annually. COLA (<b>"+cola_percent+"%</b>) increases benefit amount every December (for the January benefit payment)." +
				" This table is for claimant born in <b>" + months_user[birth_month_user]+ " " + birth_year +
				"</b> and with a lifetime earnings resulting in a PIA of <b>$"+pia+"</b> in <b>"+ String(birth_year + 62)+ "</b>" +
				" and who dies at age <b>" + max_age + "</b>." ;
	if (spendit > 0) {
		table_caption.innerHTML += "<br>Claimant is spending $" + spendit + " every month. Negative Bank Balances (if any) pay interest of <b>" + borrow_irate + "%</b>.";
	}
	if (paydownbalance > 0) {
		table_caption.innerHTML += "<br>Note: This starts with a loan pay-down situation - the initial loan balance is <b>$" + paydownbalance +
				"</b> at an annual interest rate of <b>" + borrow_irate +
				"%</b>. This interest rate is continued until the loan balance is paid off, at which time the annual " +
				"interest rate changes to <b>" + interest_percent + "%</b>.";
	}

	if (1) { // plot
		let ctx = document.createElement("canvas");
		ctx.id = "myChart";
		my_parent.appendChild(ctx);


		const delay_between_points = (animation_speed * 10) / (datasets[0].data.length+1); // +1 to avoid possible divide by 0
		let startTime = []; // Work-around for https://github.com/chartjs/Chart.js/issues/10081 - delay skew between datasets
		let startOffset = []; // ditto
		my_animation = { // Adapted from https://www.chartjs.org/docs/latest/samples/animations/progressive-line.html - although I never did fully understand it.
			x: {
				duration: 1000,
				from: NaN,
				delay(ctx) {
					if (ctx.type !== 'data') { return 0; }
					// This code assumes this function is called in order of increasing ctx.index and also increasing ctx.datasetIndex
					if (max_animation_skew_ms > 0) { // attempt to deskew the animation delays for the different datasets
						if (ctx.index == 0) {
							if (ctx.datasetIndex == 0) { startTime = []; startOffset = []; }
							startTime.push( Date.now() );
							startOffset.push( startTime[ctx.datasetIndex] - startTime[0] );
						}
						if (startOffset[ctx.datasetIndex] > max_animation_skew_ms) {
							let err_message = 'Internal error in animation delay: startOffset['+ ctx.datasetIndex+ ']='+
								startOffset[ctx.datasetIndex]+ ' is > max_animation_skew_ms='+ max_animation_skew_ms;
							console.error(err_message); // might not be user visible
							if (alert_counter < 2) {
								alert(err_message); // the message might sometimes get truncated - depending on browser, etc.?
								alert_counter += 1; // If this error occurs once, it is likely to occur many times. Avoid forcing user to endless acknowledgements
							}
						}
					} else {
						if (ctx.index == 0) {
							if (ctx.datasetIndex == 0) { startOffset = []; }
							startOffset.push(0);
						}
					}
					return max_animation_skew_ms - startOffset[ctx.datasetIndex] +ctx.index * delay_between_points;
				}
			},
		};

		my_config = {
			type: "line",
			data: { labels: labels, datasets: datasets },
			options: {
				plugins: {
					title: {
						display: true,
						text: "Claiming-Ages' affect on Social Security Retirement Benefits Future Value"
					},
					subtitle: {
						display: true,
						text: "Birth: " + String(months_user[birth_month_user]) + " " + String(birth_year) +
							", Investment Interest Rate: " + String(interest_percent) + "%, COLA: "+ String(cola_percent) + "%, PIA: $" + String(pia) +
							(spendit ? (", spending $" + spendit + " per month") : "") +
							(borrow_irate ? (", paying interest at " + borrow_irate +"% annually on negative balances") : "")
					},
					tooltip: {
						callbacks: {
							label: function(context) {
								if (context.parsed.y !== null) {
									let dollars = new Intl.NumberFormat("en-US", {
										style:"currency",
										maximumFractionDigits:0,
										currency:"USD"
									}).format(context.parsed.y);
									return "Claiming age=" + context.dataset.label + ", Future Value=" + dollars;
								}
								return undefined;
							}
						}
					}
				},
				scales : {
					y: {
						ticks: {
							callback: value => new Intl.NumberFormat("en-US", {style:"currency",
								currency:"USD",
								maximumFractionDigits:0
							}).format(value)
						}
					}
				},
				animation: my_animation,
				onClick: (e) => {
					if (my_chart != null) {
						my_chart.destroy();
						my_chart = new Chart( ctx.getContext("2d"), my_config );
					}
				}
			}
		}

		my_chart = new Chart(ctx.getContext("2d"), my_config );
	}

	return table;
}


function form1_action(parent_id=0, which_function="")
{
	let table_start_time = Date.now();
	let report_type = document.getElementById( "form1_reporttype_id" );
	let birth_year = document.getElementById( "form1_birthyear_id" );
	let birth_month = document.getElementById( "form1_birthmonth_id" );
	let interest_rate = document.getElementById( "form1_interest_id" );
	let cola = document.getElementById( "form1_COLA_id" );
	let claiming_age = document.getElementById( "form1_claiming_id" );
	let pia = document.getElementById( "form1_pia_id" );
	let age_at_death = document.getElementById( "form1_ageatdeath_id" );
	let arrears = document.getElementById( "form1_arrears_id" );
	let arrears_checked = document.querySelector('input[name="form1_arrears_name"]:checked');
	let arrears_name = document.getElementsByName( "form1_arrears_name" );
	let append_or_replace = document.getElementById( "form1_tableplacement_id" );

	let paydownbalance = document.getElementById( "form1_paydownbalance_id" );
	let borrow_irate = document.getElementById( "form1_borrow_irate_id" );
	let spendit = document.getElementById( "form1_spendit_id" );

	let animation_speed = document.getElementById( "form1_animation_speed_id" );
	let max_animation_skew = document.getElementById( "form1_max_animation_skew_id" );

	let error_message = document.getElementById( "cagess_input_form_errors" );


	error_message.innerHTML = "";

	if (0) { // for debug
		console.log("Enter form1_action(parent_id=", parent_id, ", which_function=", which_function, "):");
		console.log("    report_type: ", report_type );
		console.log("    birth_year: ", birth_year );
		console.log("    birth_year.value: ", birth_year.value );
		console.log("    typeof birth_year.value: ", typeof birth_year.value );
		console.log("    birth_month: ", birth_month );
		console.log("    birth_month.value: ", birth_month.value );
		console.log("    typeof birth_month: ", typeof birth_month.value );
		console.log("    interest_rate: ", interest_rate );
		console.log("    interest_rate.value: ", interest_rate.value );
		console.log("    typeof interest_rate.value: ", typeof interest_rate.value );
		console.log("    cola: ", cola );
		console.log("    cola.value: ", cola.value );
		console.log("    typeof cola.value: ", typeof cola.value );
		console.log("    claiming_age: ", claiming_age );
		console.log("    claiming_age.value: ", claiming_age.value );
		console.log("    claiming_age.length: ", claiming_age.length );
		console.log("    pia: ", pia );
		console.log("    pia.value: ", pia.value );
		console.log("    typeof pia.value: ", typeof pia.value );
		console.log("    age_at_death: ", age_at_death );
		console.log("    age_at_death.value: ", age_at_death.value );
		console.log("    typeof age_at_death.value: ", typeof age_at_death.value );
		console.log("    arrears: ", arrears );
		console.log("    arrears_checked: ", arrears_checked );
		console.log("    typeof arrears_checked: ", typeof arrears_checked );
		console.log("    arrears_checked.value: ", arrears_checked.value );
		console.log("    arrears_name: ", arrears_name );
		console.log("    append_or_replace: ", append_or_replace );
		console.log("    append_or_replace.value: ", append_or_replace.value );
		console.log("    typeof append_or_replace.value: ", typeof append_or_replace.value );
		console.log("    paydownbalance: ", paydownbalance );
		console.log("    paydownbalance.value: ", paydownbalance.value );
		console.log("    typeof paydownbalance.value: ", typeof paydownbalance.value );
		console.log("    borrow_irate: ", borrow_irate );
		console.log("    borrow_irate.value: ", borrow_irate.value );
		console.log("    typeof borrow_irate.value: ", typeof borrow_irate.value );
		console.log("    spendit: ", spendit );
		console.log("    spendit.value: ", spendit.value );
		console.log("    typeof spendit.value: ", typeof spendit.value );
		console.log("    animation_speed: ", animation_speed );
		console.log("    animation_speed.value: ", animation_speed.value );
		console.log("    typeof animation_speed.value: ", typeof animation_speed.value );
		console.log("    max_animation_skew: ", max_animation_skew );
		console.log("    max_animation_skew.value: ", max_animation_skew.value );
		console.log("    typeof max_animation_skew.value: ", typeof max_animation_skew.value );
		console.log("    error_message: ", error_message );
	}


	if (0) {
		//let claiming_age_array = claiming_age.value.split(' ').map(Number); // TODO - remove all spaces, support year:month syntax
		console.log("claiming_age.value=>", claiming_age.value, "<=" );
		console.log("claiming_age.value.split(' ')=", claiming_age.value.split(' ') );
		let claiming_age_array = claiming_age.value.split(' ').map(string_ycm_to_num);
	}
	if (0) { // for debug
		console.log("    After tweaks to claiming_age:");
		console.log("    claiming_age_array: ", claiming_age_array );
		console.log("    claiming_age_array.value: ", claiming_age_array.value );
		console.log("    claiming_age_array.length: ", claiming_age_array.length );
		console.log("    claiming_age_array[0]: ", claiming_age_array[0] );
		console.log("    claiming_age_array[1]: ", claiming_age_array[1] );
	}

	let new_element = null;
	if (report_type.value == "ClaimingAgeTable") {
		new_element = cagess_generate_payment_table( parent_id, Number(append_or_replace.value), Number(birth_year.value), Number(birth_month.value), Number(pia.value) );
	}
	if (report_type.value == "BankBalanceTable") {
		new_element = cagess_generate_table_bank_balance( parent_id, Number(append_or_replace.value), 
			Number(birth_year.value), Number(birth_month.value),
			claiming_ages_string_to_values( claiming_age.value ),
			Number(age_at_death.value), Number(interest_rate.value), Number(cola.value), Number(pia.value),
			Number(arrears_checked.value), "form1_errors", Number(paydownbalance.value), Number(borrow_irate.value), Number(spendit.value), Number(animation_speed.value), Number(max_animation_skew.value) );
	}

	if (report_type.value == "OptimumAgeTable_FV") {
		new_element = cagess_generate_table_best_bank_balance( parent_id, Number(append_or_replace.value),
			Number(birth_year.value), Number(birth_month.value), Number(cola.value), Number(pia.value), Number(age_at_death.value), "form1_errors" );
	}
	if (report_type.value == "OptimumAgeTable_NPV") {
		new_element = cagess_generate_table_best_month_npv_62( parent_id, Number(append_or_replace.value),
			Number(birth_year.value), Number(pia.value), Number(age_at_death.value), "form1_errors")
	}

	if (report_type.value == "Licensing") {
		new_element = cagess_licensing( parent_id );
	}

	if (new_element != null) {
		document.getElementById( "form1_table_replace_id" ).disabled = false; /* Add the "Replace Table" as an option to Table Placement in the form. */
	}

	if (1) {
		end_time = Date.now();
		let my_parent = document.getElementById(parent_id);
		let my_div = document.createElement("div");
		my_div.innerHTML = "Table creation time: " + ((end_time - table_start_time)/1000).toFixed(3) + "s";
		my_parent.appendChild(my_div);
	}

	return new_element;
}

function elements_list_alter_classes(elements_list, classes_to_remove=null, classes_to_add=null)
{
	for (element of elements_list) {
		if (classes_to_remove != null) {
			for (to_remove of classes_to_remove) {
				element.classList.remove( to_remove );
			}
		}
		if (classes_to_add != null) {
			for (to_add of classes_to_add) {
				element.classList.add( to_add );
			}
		}
	}
}

function elements_list_enable( elements_list, enable ) // if enable=0 then disable
{
	for (element of elements_list) {
		element.disabled = enable ? false : true;
	}
}

function form1_onchange_birthdate(parent_id=0)
{
	let messages_id = "cagess_input_form_messages";
	let my_parent = document.getElementById(parent_id);

	let the_element = document.getElementById(messages_id);
	if (the_element == null) { console.log("ERROR - what to do??? messages_id (", messages_id,") in function form1_onchange_birthdate(), returns null"); }

	let birth_year = document.getElementById( "form1_birthyear_id" );
	let birth_month = document.getElementById( "form1_birthmonth_id" );

	if ( (Number(birth_year.value) >= 1900) && (Number(birth_year.value) < 2100) ) {
		let full_retirement_age = cagess_full_retirement_age(Number(birth_year.value));
		the_element.innerHTML = "Full retirement age: " + cagess_to_years_months( full_retirement_age, 1 );
	} else {
		the_element.innerHTML = ""; // erase anything already written
	}
}


function claiming_ages_string_to_values( claiming_age_string )
{
	let claiming_age_values = claiming_age_string.replace(/\s+/g, ' '). split(' ').map(string_ycm_to_num);
	// Look for special cases - a space as first and/or last element
	if (claiming_age_values[0] == ' ') { claiming_age_values.shift(); }
	if (claiming_age_values[claiming_age_values.length-1] == ' ') { claiming_age_values.pop(); }

	return claiming_age_values;
}

function form1_onchange_claiming_ages(claiming_age_id)
{
	let claiming_ages = document.getElementById(claiming_age_id);
	if (claiming_ages == null) { console.log("ERROR - what to do??? claiming_age_id (", claiming_age_id,") in function form1_onchange_claiming_ages(), returns null"); }

	let  claiming_age_values = claiming_ages_string_to_values( claiming_ages.value );

	if ((claiming_age_values.length == 3) && (claiming_age_values[0] < claiming_age_values[1]) &&  (claiming_age_values[2] < claiming_age_values[1]) ) {
		let start = claiming_age_values[0];
		let stop = claiming_age_values[1];
		let increment = claiming_age_values[2];
		let new_list = [];
		let new_string1 = ""
		let new_string2 = ""
		for (let the_value = claiming_age_values[0]; the_value <= claiming_age_values[1]; the_value += claiming_age_values[2] ) {
			new_list.push( the_value );
			new_string1 += string_ycm_to_num( String(the_value) ) + " ";
			new_string2 += cagess_to_years_months( the_value, 3 )    + " ";
		}
		claiming_ages.value = new_string2;
	}

}

function form1_onchange_report(parent_id=0)
{
	if (0) { console.log("In form1_onchange_report(parent_id=", parent_id, ")"); }
	let report_type = document.getElementById( "form1_reporttype_id" );
	let birth_year = document.getElementById( "form1_birthyear_id" );
	let birth_month = document.getElementById( "form1_birthmonth_id" );
	let interest_rate = document.getElementById( "form1_interest_id" );
	let cola = document.getElementById( "form1_COLA_id" );
	let claiming_age = document.getElementById( "form1_claiming_id" );
	let pia = document.getElementById( "form1_pia_id" );
	let age_at_death = document.getElementById( "form1_ageatdeath_id" );
	let arrears = document.getElementById( "form1_arrears_id" );
	//console.log("arrears=", arrears, ", from GetElementById( form1_arrears_id )" );
	let arrears_value = document.querySelector('input[name="form1_arrears_name"]:checked');
	//console.log("arrears_value=", arrears_value);
	let arrears_name = document.getElementsByName( "form1_arrears_name" );
	//console.log("arrears_name=", arrears_name, ", from GetElementsByName( form1_arrears_name )" );
	let tableplacement = document.getElementById( "form1_tableplacement_id" );
	let paydownbalance = document.getElementById( "form1_paydownbalance_id" );
	let borrow_irate = document.getElementById( "form1_borrow_irate_id" );
	//console.log("borrow_irate=", borrow_irate);
	let spendit = document.getElementById( "form1_spendit_id" );
	let animation_speed = document.getElementById( "form1_animation_speed_id" );
	let max_animation_skew = document.getElementById( "form1_max_animation_skew_id" );

	let birthyear_elements_list		= document.getElementsByClassName("cagess_table_row_birthyear"); 
	let birthmonth_elements_list		= document.getElementsByClassName("cagess_table_row_birthmonth"); 
	let interest_rate_elements_list		= document.getElementsByClassName("cagess_table_row_invest_interest"); 
	let cola_elements_list			= document.getElementsByClassName("cagess_table_row_COLA"); 
	let pia_elements_list			= document.getElementsByClassName("cagess_table_row_pia"); 
	let age_at_death_elements_list		= document.getElementsByClassName("cagess_table_row_age_at_death"); 
	let claimingages_elements_list  	= document.getElementsByClassName("cagess_table_row_claimingages"); 
	let arrears_elements_list       	= document.getElementsByClassName("cagess_table_row_arrears"); 
	let paydownbalance_elements_list	= document.getElementsByClassName("cagess_table_row_paydownbalance"); 
	let borrow_irate_elements_list		= document.getElementsByClassName("cagess_table_row_borrow_irate"); 
	let spendit_elements_list		= document.getElementsByClassName("cagess_table_row_spendit"); 
	let animation_speed_elements_list	= document.getElementsByClassName("cagess_table_row_animation_speed"); 
	let max_animation_skew_elements_list	= document.getElementsByClassName("cagess_table_row_max_animation_skew"); 


	elements_list_alter_classes( birthyear_elements_list,         ["cagess_disabled_row"], [] );
	elements_list_alter_classes( birthmonth_elements_list,        ["cagess_disabled_row"], [] );
	elements_list_alter_classes( interest_rate_elements_list,     ["cagess_disabled_row"], [] );
	elements_list_alter_classes( cola_elements_list,              ["cagess_disabled_row"], [] );
	elements_list_alter_classes( interest_rate_elements_list,     ["cagess_disabled_row"], [] );
	elements_list_alter_classes( pia_elements_list,               ["cagess_disabled_row"], [] );
	elements_list_alter_classes( age_at_death_elements_list,      ["cagess_disabled_row"], [] );
	elements_list_alter_classes( claimingages_elements_list,      ["cagess_disabled_row"], [] );
	elements_list_alter_classes( arrears_elements_list,           ["cagess_disabled_row"], [] );
	elements_list_alter_classes( paydownbalance_elements_list,    ["cagess_disabled_row"], [] );
	elements_list_alter_classes( borrow_irate_elements_list,      ["cagess_disabled_row"], [] );
	elements_list_alter_classes( spendit_elements_list,           ["cagess_disabled_row"], [] );
	elements_list_alter_classes( animation_speed_elements_list,   ["cagess_disabled_row"], [] );
	elements_list_alter_classes( max_animation_skew_elements_list,["cagess_disabled_row"], [] );
	elements_list_enable( arrears_name, 1 );

	//console.log("report_type.value=", report_type.value);
	if (report_type.value == "ClaimingAgeTable") {
		birth_year.disabled = false;
		birth_month.disabled = false;
		interest_rate.disabled = true;
		elements_list_alter_classes( interest_rate_elements_list, [], ["cagess_disabled_row"] );
		cola.disabled = true;
		elements_list_alter_classes( cola_elements_list, [], ["cagess_disabled_row"] );
		claiming_age.disabled = true;
		elements_list_alter_classes( claimingages_elements_list, [], ["cagess_disabled_row"] );
		pia.disabled = false;
		age_at_death.disabled = true;
		elements_list_alter_classes( age_at_death_elements_list, [], ["cagess_disabled_row"] );
		//arrears.disabled = true;
		elements_list_alter_classes( arrears_elements_list, [], ["cagess_disabled_row"] );
		elements_list_enable( arrears_name, 0 );
		paydownbalance.disabled = true;
		elements_list_alter_classes( paydownbalance_elements_list, [], ["cagess_disabled_row"] );
		borrow_irate.disabled = true;
		elements_list_alter_classes( borrow_irate_elements_list, [], ["cagess_disabled_row"] );
		spendit.disabled = true;
		elements_list_alter_classes( spendit_elements_list, [], ["cagess_disabled_row"] );
		animation_speed.disabled = true;
		elements_list_alter_classes( animation_speed_elements_list, [], ["cagess_disabled_row"] );
		max_animation_skew.disabled = true;
		elements_list_alter_classes( max_animation_skew_elements_list, [], ["cagess_disabled_row"] );
	}

	if (report_type.value == "BankBalanceTable") {
		//console.log("    BankBalanceTable");
		birth_year.disabled = false;
		birth_month.disabled = false;
		interest_rate.disabled = false;
		cola.disabled = false;
		claiming_age.disabled = false;
		pia.disabled = false;
		age_at_death.disabled = false;
		//arrears.disabled = false;
		paydownbalance.disabled = false;
		borrow_irate.disabled = false;
		spendit.disabled = false;
		animation_speed.disabled = false;
		if (animation_speed.value == 0) {
			max_animation_skew.disabled = true;
			elements_list_alter_classes( max_animation_skew_elements_list, [], ["cagess_disabled_row"] );
		} else {
			max_animation_skew.disabled = false;
		}
	}


	if (report_type.value == "OptimumAgeTable_FV") {
		birth_year.disabled = false;
		birth_month.disabled = false;
		interest_rate.disabled = true;
		elements_list_alter_classes( interest_rate_elements_list, [], ["cagess_disabled_row"] );
		cola.disabled = false;
		claiming_age.disabled = true;
		elements_list_alter_classes( claimingages_elements_list, [], ["cagess_disabled_row"] );
		pia.disabled = false;
		//arrears.disabled = true;
		elements_list_alter_classes( arrears_elements_list, [], ["cagess_disabled_row"] );
		elements_list_enable( arrears_name, 0 );
		paydownbalance.disabled = true;
		elements_list_alter_classes( paydownbalance_elements_list, [], ["cagess_disabled_row"] );
		borrow_irate.disabled = true;
		elements_list_alter_classes( borrow_irate_elements_list, [], ["cagess_disabled_row"] );
		spendit.disabled = true;
		elements_list_alter_classes( spendit_elements_list, [], ["cagess_disabled_row"] );
		animation_speed.disabled = true;
		elements_list_alter_classes( animation_speed_elements_list, [], ["cagess_disabled_row"] );
		max_animation_skew.disabled = true;
		elements_list_alter_classes( max_animation_skew_elements_list, [], ["cagess_disabled_row"] );
	}
	if (report_type.value == "OptimumAgeTable_NPV") {
		//console.log("    OptimumAgeTable_NPV");
		birth_year.disabled = false;
		birth_month.disabled = false;
		interest_rate.disabled = true;
		elements_list_alter_classes( interest_rate_elements_list, [], ["cagess_disabled_row"] );
		cola.disabled = false;
		claiming_age.disabled = true;
		elements_list_alter_classes( claimingages_elements_list, [], ["cagess_disabled_row"] );
		pia.disabled = false;
		//arrears.disabled = true;
		elements_list_alter_classes( arrears_elements_list, [], ["cagess_disabled_row"] );
		elements_list_enable( arrears_name, 0 );
		paydownbalance.disabled = true;
		elements_list_alter_classes( paydownbalance_elements_list, [], ["cagess_disabled_row"] );
		borrow_irate.disabled = true;
		elements_list_alter_classes( borrow_irate_elements_list, [], ["cagess_disabled_row"] );
		spendit.disabled = true;
		elements_list_alter_classes( spendit_elements_list, [], ["cagess_disabled_row"] );
		animation_speed.disabled = true;
		elements_list_alter_classes( animation_speed_elements_list, [], ["cagess_disabled_row"] );
		max_animation_skew.disabled = true;
		elements_list_alter_classes( max_animation_skew_elements_list, [], ["cagess_disabled_row"] );
	}

	if (0) { // for debug
		console.log("Enter form1_action(parent_id=", parent_id, ")");
		console.log("    report_type: ", report_type );
		console.log("    birth_year: ", birth_year );
		console.log("    birth_year.value: ", birth_year.value );
		console.log("    typeof birth_year.value: ", typeof birth_year.value );
		console.log("    birth_month: ", birth_month );
		console.log("    birth_month.value: ", birth_month.value );
		console.log("    typeof birth_month: ", typeof birth_month.value );
		console.log("    interest_rate: ", interest_rate );
		console.log("    interest_rate.value: ", interest_rate.value );
		console.log("    typeof interest_rate.value: ", typeof interest_rate.value );
		console.log("    cola: ", cola );
		console.log("    cola.value: ", cola.value );
		console.log("    typeof cola.value: ", typeof cola.value );
		console.log("    claiming_age: ", claiming_age );
		console.log("    claiming_age.value: ", claiming_age.value );
		console.log("    claiming_age.length: ", claiming_age.length );
		console.log("    pia: ", pia );
		console.log("    pia.value: ", pia.value );
		console.log("    typeof pia.value: ", typeof pia.value );
		console.log("    arrears: ", arrears );
		//console.log("    arrears.value: ", arrears.value );
		//console.log("    typeof arrears.value: ", typeof arrears.value );
		console.log("    arrears_name: ", arrears_name );
		console.log("    tableplacement: ", tableplacement );
		console.log("    tableplacement.value: ", tableplacement.value );
		console.log("    typeof tableplacement.value: ", typeof tableplacement.value );
		console.log("    paydownbalance: ", paydownbalance );
		console.log("    paydownbalance.value: ", paydownbalance.value );
		console.log("    typeof paydownbalance.value: ", typeof paydownbalance.value );
		console.log("    borrow_irate: ", borrow_irate );
		console.log("    borrow_irate.value: ", borrow_irate.value );
		console.log("    typeof borrow_irate.value: ", typeof borrow_irate.value );
		console.log("    spendit: ", spendit );
		console.log("    spendit.value: ", spendit.value );
		console.log("    typeof spendit.value: ", typeof spendit.value );
		console.log("    animation_speed: ", animation_speed );
		console.log("    animation_speed.value: ", animation_speed.value );
		console.log("    typeof animation_speed.value: ", typeof animation_speed.value );
		console.log("    max_animation_skew: ", max_animation_skew );
		console.log("    max_animation_skew.value: ", max_animation_skew.value );
		console.log("    typeof max_animation_skew.value: ", typeof max_animation_skew.value );
	}


	if (0) {
		let elements = document.getElementsByClassName( "table1_class" );
		console.log("elements.length=", elements.length );
		for (let ii=0; ii<elements.length; ii++) {
			console.log("elements[", ii, "]=", elements[ii]);
		}
	}
}




function cagess_create_input_form( parent_id )
{
	let my_parent = document.getElementById(parent_id);
	if (my_parent == null) { console.log("ERROR: no element found with id=", parent_id); return null; }

	let table1 = document.createElement("table");
	//table1.class = "cagess_control_form";
	table1.classList.add("cagess_control_form");
	my_parent.appendChild(table1);

	let table1_body = table1.createTBody();


	let form1 = document.createElement("form");
	form1.name="SS_Form";
	
	// Row 0 -------------------
	let table1_row0 = table1_body.insertRow(-1);
	table1_row0.classList.add("cagess_table_row_0");

	let label = document.createElement("label");
	label.for = "Report Type:";
	label.innerHTML = "Report Type:";
	table1_row0.insertCell(-1).appendChild(label);

	let select_func = document.createElement("select");
	select_func.setAttribute("id", "form1_reporttype_id");
	select_func.setAttribute("name", "form1_reporttype_name");
	select_func.setAttribute("onchange", "form1_onchange_report(" + parent_id + ")" );

	let func_option = document.createElement("option");
	func_option.text = "Monthly Retirement Benefit - versus Claiming-Age";
	func_option.value = "ClaimingAgeTable";
	select_func.appendChild(func_option);

	func_option = document.createElement("option");
	func_option.text = "Bank Balance per Month Table";
	func_option.value = "BankBalanceTable";
	select_func.appendChild(func_option);

	/*
	func_option = document.createElement("option");
	func_option.text = "Optimum Retirement Claiming Age Summary Chart - Bank Balance";
	func_option.value = "OptimumAgeTable_FV";
	select_func.appendChild(func_option);
	*/

	/*
	func_option = document.createElement("option");
	func_option.text = "Optimum Retirement Claiming Age Summary Chart - Present Value";
	func_option.value = "OptimumAgeTable_NPV";
	select_func.appendChild(func_option);
	*/

	func_option = document.createElement("option");
	func_option.text = "Licensing and Copyright notices";
	func_option.value = "Licensing";
	select_func.appendChild(func_option);

/*
	func_option = document.createElement("option");
	func_option.text = "Graph1 - Experiment";
	func_option.value = "Graph1";
	select_func.appendChild(func_option);

	func_option = document.createElement("option");
	func_option.text = "Graph2 - Experiment";
	func_option.value = "Graph2";
	select_func.appendChild(func_option);
	*/

	form1.appendChild(select_func);
	let cell = table1_row0.insertCell(-1);
	cell.appendChild(select_func);

	let description_cell = table1_row0.insertCell(-1);
	description_cell.classList.add("description");
	description_cell.innerHTML = "Select between several report and chart types. Each type may require different arguments in the following rows.";


	// Row 1 -------------------
	let table1_row1 = table1_body.insertRow(-1);
	table1_row1.classList.add("cagess_table_row_birthyear");

	cell = table1_row1.insertCell(-1);
	label = document.createElement("label");
	label.for = "Birth year:";
	label.innerHTML = "Birth year:";
	cell.appendChild(label);

	input = document.createElement("input");
	input.type="text";
	input.id="form1_birthyear_id";
	input.name="birthyear_name";
	input.text="the text";
	input.value = "";
	input.setAttribute("onchange", "form1_onchange_birthdate(" + parent_id + ")" );
	form1.appendChild(input);
	cell = table1_row1.insertCell(-1);
	cell.appendChild(input);

	description_cell = table1_row1.insertCell(-1);
	description_cell.classList.add("description");
	description_cell.innerHTML = "Affects Full Retirement Age.";


	// Row 2 -------------------
	let table1_row2 = table1_body.insertRow(-1);
	table1_row2.classList.add("cagess_table_row_birthmonth");

	label = document.createElement("label");
	label.for = "Birth month:";
	label.innerHTML = "Birth month:";
	table1_row2.insertCell(-1).appendChild(label);

	let select_bm = document.createElement("select");
	select_bm.setAttribute("id", "form1_birthmonth_id");
	select_bm.setAttribute("name", "form1_birthmonth");
	let index =  0;
	for (index=0; index <=  12; index++) {
		let b_month = (index == 0) ? "Select birth-month" : months_user[index];
		let option = document.createElement("option");
		option.text = b_month;
		option.value = index;
		select_bm.appendChild(option);
	}
	form1.appendChild(select_bm);
	select_bm.setAttribute("onchange", "form1_onchange_birthdate(" + parent_id + ")" );
	cell = table1_row2.insertCell(-1);
	cell.appendChild(select_bm);

	description_cell = table1_row2.insertCell(-1);
	description_cell.classList.add("description");
	description_cell.innerHTML = "Along with birthyear, determines month of Full Retirement Age (day of month doesn't affect benefit calculations).";

	// Row 3 -------------------
	let table1_row3 = table1_body.insertRow(-1);
	table1_row3.classList.add("cagess_table_row_COLA");

	cell = table1_row3.insertCell(-1);
	label = document.createElement("label");
	label.for = "COLA:";
	label.innerHTML = "COLA: (%)";
	cell.appendChild(label);

	input = document.createElement("input");
	input.type="text";
	input.id="form1_COLA_id";
	input.name="COLA_name";
	input.value = "0";
	form1.appendChild(input);
	cell = table1_row3.insertCell(-1);
	cell.appendChild(input);

	description_cell = table1_row3.insertCell(-1);
	description_cell.classList.add("description");
	description_cell.innerHTML = "<b>Optional</b>: Your <i>estimate</i> of the annual Cost Of Living Adjustment (which helps counter inflation).";


	// Row 4 -------------------
	let table1_row4 = table1_body.insertRow(-1);
	table1_row4.classList.add("cagess_table_row_invest_interest");

	cell = table1_row4.insertCell(-1);
	label = document.createElement("label");
	label.for = "Investment Interest Rate:";
	label.innerHTML = "Investment Interest Rate: (%)";
	cell.appendChild(label);

	input = document.createElement("input");
	input.type="text";
	input.id="form1_interest_id";
	input.name="interest_name";
	input.value = "0";
	form1.appendChild(input);
	cell = table1_row4.insertCell(-1);
	cell.appendChild(input);

	description_cell = table1_row4.insertCell(-1);
	description_cell.classList.add("description");
	description_cell.innerHTML = "<b>Optional</b>: Your <i>estimate</i> of the annual interest rate to be paid on a <i>positive</i> bank balance. Note: also see <b>Borrow Interest Rate</b>";

	// Row 5 -------------------
	let table1_row5 = table1_body.insertRow(-1);
	table1_row5.classList.add("cagess_table_row_claimingages");

	cell = table1_row5.insertCell(-1);
	label = document.createElement("label");
	label.for = "Claiming-Ages List:";
	label.innerHTML = "Claiming-Ages:";
	label.title = "List of numbers between 62 and 70";
	cell.appendChild(label);

	input = document.createElement("input");
	input.type="text";
	input.id="form1_claiming_id";
	input.name="claiming_name";
	input.value = "62 67 70";
	input.setAttribute("onchange", "form1_onchange_claiming_ages(\"" + input.id + "\")" );
	form1.appendChild(input);
	cell = table1_row5.insertCell(-1);
	cell.appendChild(input);

	description_cell = table1_row5.insertCell(-1);
	description_cell.classList.add("description");
	description_cell.innerHTML = "A list of claiming-ages - in year:month format - for which to include in table. 64:5 means 5 months after 64th birthday. " +
					"67 is the same as 67:0. Note: a start stop increment format is also supported - here's an example of this special case: <b>62 64 :6</b> means 62 62:6 63 63:6 64.";


	// Row PIA -------------------
	let table1_rowPIA = table1_body.insertRow(-1);
	table1_rowPIA.classList.add("cagess_table_row_pia");

	cell = table1_rowPIA.insertCell(-1);
	label = document.createElement("label");
	label.for = "PIA:";
	label.innerHTML = "PIA: ($)";
	cell.appendChild(label);

	input = document.createElement("input");
	input.type="text";
	input.id="form1_pia_id";
	input.name="pia_name";
	input.value = "1000";
	form1.appendChild(input);
	cell = table1_rowPIA.insertCell(-1);
	cell.appendChild(input);

	description_cell = table1_rowPIA.insertCell(-1);
	description_cell.classList.add("description");
	description_cell.innerHTML = "Primary Insurance Amount is the amount that the SSA calculates as your benefit at your Full Retirement Age." +
				"<br>You may find this listed as <b>Your monthly benefit at Full Retirement Age</b> on your  <i>my Social Security</i> under <b>Plan For Retirement</b> after logging onto <a href=\"https://www.ssa.gov/\">www.ssa.gov</a>.";


	// Row AgeAtDeath -------------------
	let table1_rowAgeAtDeath = table1_body.insertRow(-1);
	table1_rowAgeAtDeath.classList.add("cagess_table_row_age_at_death");

	cell = table1_rowAgeAtDeath.insertCell(-1);
	label = document.createElement("label");
	label.for = "Age at Death:";
	label.innerHTML = "Age at Death: ";
	cell.appendChild(label);

	input = document.createElement("input");
	input.type="text";
	input.id="form1_ageatdeath_id";
	input.name="ageatdeath_name";
	input.value = "100";
	form1.appendChild(input);
	cell = table1_rowAgeAtDeath.insertCell(-1);
	cell.appendChild(input);

	description_cell = table1_rowAgeAtDeath.insertCell(-1);
	description_cell.classList.add("description");
	description_cell.innerHTML = "<b>Optional</b>: Estimated age at death (year:month). Note that the SSA does NOT pay a benefit for the month of death.";

	// Row Arrears -------------------
	let table1_rowArrears = table1_body.insertRow(-1);
	table1_rowArrears.classList.add("cagess_table_row_arrears");

	cell = table1_rowArrears.insertCell(-1);
	label = document.createElement("label");
	label.for = "Arrears:";
	label.innerHTML = "Arrears:";
	// The following is from https://www.ssa.gov/pubs/EN-05-10077.pdf : "What You Need to Know When You Get Retirement or Survivors Benefits"
	label.title = "Social Security benefits are paid in the month that follows the month for which they are due."
	cell.appendChild(label);

	let radio1 = document.createElement("input");
	radio1.type="radio";
	radio1.name="form1_arrears_name";
	radio1.id="form1_arrears_id_0";
	radio1.value = "0";
	radio1.checked = true;
	radio1.label = "z1";
	form1.appendChild(radio1);
	cell = table1_rowArrears.insertCell(-1);
	cell.appendChild(radio1);
	if(1) {
		let label = document.createElement("label");
		label.for = "When Due";
		label.innerHTML = "When Due ";
		cell.appendChild(label);
	}

	let radio2 = document.createElement("input");
	radio2.type="radio";
	radio2.name="form1_arrears_name";
	radio2.id="form1_arrears_id_1";
	radio2.value = "1";
	radio2.z2 = "z2";
	form1.appendChild(radio2);
	cell.appendChild(radio2);
	if(1) {
		let label = document.createElement("label");
		label.for = "When Paid";
		label.innerHTML = "When Paid";
		cell.appendChild(label);
	}

	description_cell = table1_rowArrears.insertCell(-1);
	description_cell.classList.add("description");
	description_cell.innerHTML = "<b>Optional</b>: Benefits are typically paid a month later. For example, the benefit payment received in July is typically the June benefit. " +
		"For simplicity, most reports here do NOT consider this delay - this is the \"When Due\" default. If \"When Paid\" is enabled, the report will consider that delay.";


	// Row PayDown (1 of 2) -------------------
	let table1_rowPayDownBalance = table1_body.insertRow(-1);
	table1_rowPayDownBalance.classList.add("cagess_table_row_paydownbalance");

	cell = table1_rowPayDownBalance.insertCell(-1);
	label = document.createElement("label");
	label.for = "Pay Down Balance:";
	label.innerHTML = "Pay Down Balance: ($)";
	cell.appendChild(label);

	input = document.createElement("input");
	input.type="text";
	input.id="form1_paydownbalance_id";
	input.name="paydownbalance_name";
	input.value = "0";
	form1.appendChild(input);
	cell = table1_rowPayDownBalance.insertCell(-1);
	cell.appendChild(input);

	description_cell = table1_rowPayDownBalance.insertCell(-1);
	description_cell.classList.add("description");
	//description.rowSpan = "2";
	description_cell.innerHTML = "<b>Optional</b>: For the situation where the claimant has an outstanding loan, perhaps credit-card or a mortgage. This is the outstanding balance on that loan. Calculations assume Social Security benefits will be used to pay down this loan.";

	// Row PayDown (2 of 2) -------------------
	let table1_rowPayDownRate = table1_body.insertRow(-1);
	table1_rowPayDownRate.classList.add("cagess_table_row_borrow_irate");

	cell = table1_rowPayDownRate.insertCell(-1);
	label = document.createElement("label");
	label.for = "Borrow Interest Rate:";
	label.innerHTML = "Borrow Interest Rate: (%)";
	cell.appendChild(label);

	input = document.createElement("input");
	input.type="text";
	input.id="form1_borrow_irate_id";
	input.name="borrow_irate_name";
	input.value = "0";
	form1.appendChild(input);
	cell = table1_rowPayDownRate.insertCell(-1);
	cell.appendChild(input);

	description_cell = table1_rowPayDownRate.insertCell(-1);
	description_cell.classList.add("description");
	description_cell.innerHTML = "<b>Optional</b>: The annual interest rate on the any borrowed amount - such as with <b>Pay Down Balance</b>.";


	// Row SpendIt -------------------
	let table1_rowSpendIt = table1_body.insertRow(-1);
	table1_rowSpendIt.classList.add("cagess_table_row_spendit");

	cell = table1_rowSpendIt.insertCell(-1);
	label = document.createElement("label");
	label.for = "Monthly Spend:";
	label.innerHTML = "Monthly Spending ($)";
	cell.appendChild(label);

	input = document.createElement("input");
	input.type="text";
	input.id="form1_spendit_id";
	input.name="spendit_name";
	input.value = "0";
	form1.appendChild(input);
	cell = table1_rowSpendIt.insertCell(-1);
	cell.appendChild(input);

	description_cell = table1_rowSpendIt.insertCell(-1);
	description_cell.classList.add("description");
	description_cell.innerHTML = "<b>Optional</b>: Monthly spending. The report deducts this from your bank balance. If balance is negative, the <b>Borrow Interest Rate (%)</b> is applied.";

	// Row Animation Speed  -------------------
	let table1_rowAnimationSpeed = table1_body.insertRow(-1);
	table1_rowAnimationSpeed.classList.add("cagess_table_row_animation_speed");

	cell = table1_rowAnimationSpeed.insertCell(-1);
	label = document.createElement("label");
	label.for = "Animation Speed:";
	label.innerHTML = "Animation Speed";
	cell.appendChild(label);

	input = document.createElement("input");
	input.type="text";
	input.id="form1_animation_speed_id";
	input.name="animation_speed_name";
	input.value = "0";
	input.setAttribute("onchange", "form1_onchange_report(" + parent_id + ")" );
	form1.appendChild(input);
	cell = table1_rowAnimationSpeed.insertCell(-1);
	cell.appendChild(input);

	description_cell = table1_rowAnimationSpeed.insertCell(-1);
	description_cell.classList.add("description");
	description_cell.innerHTML = "<b>Optional</b>: 0 disables animation of the chart. Try 100 and then increase or decrease as desired.";



	// Row Max Animation Skew -------------------
	let table1_rowMaxAnimationSkew = table1_body.insertRow(-1);
	table1_rowMaxAnimationSkew.classList.add("cagess_table_row_max_animation_skew");

	cell = table1_rowMaxAnimationSkew.insertCell(-1);
	label = document.createElement("label");
	label.for = "Max Animation Skew:";
	label.innerHTML = "Max Animation Skew";
	cell.appendChild(label);

	input = document.createElement("input");
	input.type="text";
	input.id="form1_max_animation_skew_id";
	input.name="max_animation_skew_name";
	input.value = "3000";
	form1.appendChild(input);
	cell = table1_rowMaxAnimationSkew.insertCell(-1);
	cell.appendChild(input);

	description_cell = table1_rowMaxAnimationSkew.insertCell(-1);
	description_cell.classList.add("description");
	description_cell.innerHTML = "<b>Optional</b>: A work-around for a known bug in Chart.js. Not used unless <b>Animation Speed</b> is enabled. Increase this value if you see an error about <b>animation delay</b> or <b>max_animation_skew</b>. Otherwise ignore this parameter.";


	// Row AppendTable -------------------
	let table1_rowAppendTable = table1_body.insertRow(-1);
	table1_rowAppendTable.classList.add("cagess_table_row_tableplacement");

	cell = table1_rowAppendTable.insertCell(-1);
	label = document.createElement("label");
	label.for = "TablePlacement:";
	label.innerHTML = "TablePlacement:";
	cell.appendChild(label);

	let select_tt = document.createElement("select");
	select_tt.setAttribute("id", "form1_tableplacement_id");
	select_tt.setAttribute("name", "form1_tableplacement_name");

	let tt_option = document.createElement("option");
	tt_option.text = "Append Table";
	tt_option.value = 0;
	select_tt.appendChild(tt_option);

	if (1) { // TODO: Make this conditional on an existing table - need to do this elsewhere (maybe end of form1_action - via Javascript)
		// Note that this option will replace this form table if used before any other table is appended.
		let table_list = my_parent.querySelectorAll("table");
		//console.log("parent_id=", parent_id, ", my_parent=", my_parent, ", table_list=", table_list, ", length=", table_list.length );

		let show_it = (table_list.length > 1);


		let tt_option = document.createElement("option");
		tt_option.text = "Replace Table";
		tt_option.value = 1;
		if (show_it == false) { tt_option.setAttribute("disabled", true ); }
		tt_option.setAttribute("id", "form1_table_replace_id");
		select_tt.appendChild(tt_option);
	}

	form1.appendChild(select_tt);
	cell = table1_rowAppendTable.insertCell(-1);
	cell.appendChild(select_tt);

	description_cell = table1_rowAppendTable.insertCell(-1);
	description_cell.classList.add("description");
	description_cell.innerHTML = "<b>Optional</b>: This affects where the generated report or table is placed on the page. The new report may be either appended after " +
				"any previously generated reports, or may replace the last previously generated report.";


	// Row Buttons -------------------
	let table1_rowButtons = table1_body.insertRow(-1);

	cell = table1_rowButtons.insertCell(-1);
	cell.colSpan = "2";

	let button1 = document.createElement("button");
	button1.type = "submit";
	button1.textContent = "Create Report";
	button1.value = "button1 value";
	button1.id = "button1 id";
	button1.addEventListener("click", () => { form1_action(parent_id, "CreateReport"); });
	button1.title = "Is this HoverText?";
	cell.appendChild(button1);

	description_cell = table1_rowButtons.insertCell(-1);
	description_cell.classList.add("description");
	description_cell.innerHTML = "";

	// Row Errors -------------------
	let table1_rowErrors = table1_body.insertRow(-1);
	table1_rowErrors.classList.add("cagess_table_row_error");
	cell = table1_rowErrors.insertCell(-1);
	cell.colSpan = "3";
	cell.innerHTML = "";
	cell.id = "cagess_input_form_errors";

	// Row Messages -------------------
	let table1_rowMessages = table1_body.insertRow(-1);
	table1_rowMessages.classList.add("cagess_table_row_messages");
	cell = table1_rowMessages.insertCell(-1);
	cell.colSpan = "3";
	cell.innerHTML = "";
	cell.id = "cagess_input_form_messages";


	//my_parent.appendChild(table1);
	my_parent.appendChild(form1);

	form1_onchange_report(parent_id);

	return form1;
}

function cagess_licensing( parent_id )
{
	let my_parent = document.getElementById(parent_id);
	if (my_parent == null) { console.error("ERROR: no element found with id="+ parent_id+ " in cagess_licensing" ); return null; }

	let table_list = my_parent.querySelectorAll("table");
	table = table_list[ table_list.length-1];
	if ( typeof table !== "undefined" ) {
		while (table.hasChildNodes()) {
			table.removeChild(table.lastChild);
		}
	}

	let my_div = document.createElement("div");
	my_div.id = "mit_license";

	my_div.innerHTML =
		"<p>Copyright (c) 2023-2024 Don Organ" +
		"<p>Copyright (c) 2014-2022 Chart.js Contributors" +

		"<p>Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the \"Software\"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:" +

		"<p>The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software." + 

		"<p>THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.";

	my_parent.appendChild(my_div);
}

